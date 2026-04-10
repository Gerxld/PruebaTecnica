"""
prediction_service.py — Análisis predictivo de probabilidad de pago.

Usa LogisticRegression de scikit-learn cuando hay datos suficientes,
o una heurística ponderada cuando el dataset es muy pequeño.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

if TYPE_CHECKING:
    from graph_manager import GraphManager

REFERENCE_DATE = datetime(2025, 8, 12, tzinfo=timezone.utc)
RECENT_PAYMENT_WINDOW_DAYS = 7

# Feature names — el orden debe mantenerse consistente con _build_features()
FEATURE_NAMES = [
    "risk_score",
    "tasa_promesas",
    "promesas_hechas",
    "ratio_pagado_deuda",
    "ratio_pendiente_deuda",
    "dias_desde_ultimo_contacto",
    "total_interacciones",
    "ratio_pagos_inmediatos",
    "tiene_promesa_activa",
    "estado_activo",
]


def _parse_ts(ts_str: str) -> Optional[datetime]:
    if not ts_str:
        return None
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


class PaymentPredictor:
    """Predice la probabilidad de pago de un cliente en los próximos 7 días."""

    def __init__(self) -> None:
        self._model: Any = None
        self._model_type: str = "sin_entrenar"
        self._feature_weights: List[float] = []
        self._gm: Optional[Any] = None
        self._trained: bool = False

    # ------------------------------------------------------------------ #
    #  Extracción de features                                              #
    # ------------------------------------------------------------------ #

    def _build_features(self, gm: "GraphManager", cliente_id: str) -> List[float]:
        """Construye el vector de 10 features para un cliente."""
        client = gm.clients.get(cliente_id, {})
        interactions = gm.interactions_by_client.get(cliente_id, [])
        promises = gm.promises_by_client.get(cliente_id, [])

        # 1. risk_score normalizado a [0,1]
        risk_score_raw = float(client.get("risk_score", 50))
        risk_score = risk_score_raw / 100.0

        # 2. tasa_promesas
        promesas_hechas = int(client.get("promesas_hechas", 0))
        promesas_cumplidas = int(client.get("promesas_cumplidas", 0))
        tasa_promesas = (promesas_cumplidas / promesas_hechas) if promesas_hechas > 0 else 0.0

        # 3. promesas_hechas normalizado (cap en 20)
        promesas_hechas_norm = min(promesas_hechas / 20.0, 1.0)

        # 4. ratio_pagado_deuda
        monto_deuda = float(client.get("monto_deuda_inicial", 1) or 1)
        total_pagado = float(client.get("total_pagado", 0))
        ratio_pagado = min(total_pagado / monto_deuda, 1.0)

        # 5. ratio_pendiente_deuda
        monto_pendiente = float(client.get("monto_pendiente", monto_deuda))
        ratio_pendiente = min(monto_pendiente / monto_deuda, 1.0)

        # 6. dias_desde_ultimo_contacto (normalizado, cap en 180 días)
        timestamps = [
            _parse_ts(i.get("timestamp", ""))
            for i in interactions
            if i.get("timestamp")
        ]
        timestamps = [t for t in timestamps if t is not None]
        if timestamps:
            ultimo_contacto = max(timestamps)
            dias = max(0, (REFERENCE_DATE - ultimo_contacto).days)
        else:
            dias = 180  # máximo penalización si no hay contacto
        dias_norm = min(dias / 180.0, 1.0)

        # 7. total_interacciones (normalizado, cap en 50)
        total_interacciones = len(interactions)
        total_int_norm = min(total_interacciones / 50.0, 1.0)

        # 8. ratio_pagos_inmediatos
        pagos_inmediatos = sum(
            1 for i in interactions if i.get("resultado") == "pago_inmediato"
        )
        ratio_pagos_inmediatos = (
            pagos_inmediatos / total_interacciones if total_interacciones > 0 else 0.0
        )

        # 9. tiene_promesa_activa
        tiene_promesa_activa = 0.0
        for p in promises:
            fecha_str = p.get("fecha_promesa", "")
            if not fecha_str:
                continue
            fp_dt = _parse_ts(fecha_str + "T00:00:00Z")
            if fp_dt and fp_dt > REFERENCE_DATE and not p.get("cumplida", False):
                tiene_promesa_activa = 1.0
                break

        # 10. estado_activo
        estado_activo = 1.0 if client.get("estado") == "activo" else 0.0

        return [
            risk_score,
            tasa_promesas,
            promesas_hechas_norm,
            ratio_pagado,
            ratio_pendiente,
            dias_norm,
            total_int_norm,
            ratio_pagos_inmediatos,
            tiene_promesa_activa,
            estado_activo,
        ]

    def _build_label(self, gm: "GraphManager", cliente_id: str) -> int:
        """
        Label = 1 si el cliente tiene al menos un pago con timestamp
        >= (REFERENCE_DATE - 7 días).
        """
        cutoff = REFERENCE_DATE - timedelta(days=RECENT_PAYMENT_WINDOW_DAYS)
        payments = gm.payments_by_client.get(cliente_id, [])
        for p in payments:
            ts = _parse_ts(p.get("timestamp", ""))
            if ts and ts >= cutoff:
                return 1
        return 0

    # ------------------------------------------------------------------ #
    #  Entrenamiento                                                       #
    # ------------------------------------------------------------------ #

    def train(self, gm: "GraphManager") -> None:
        """Entrena el modelo con los datos del grafo actual."""
        self._gm = gm
        self._trained = False

        if not gm.clients:
            return

        X: List[List[float]] = []
        y: List[int] = []

        for cid in gm.clients:
            try:
                features = self._build_features(gm, cid)
                label = self._build_label(gm, cid)
                X.append(features)
                y.append(label)
            except Exception:
                continue

        if not X:
            return

        positivos = sum(y)

        if positivos >= 10:
            self._train_logistic(X, y)
        else:
            self._train_heuristic(X, y)

        self._trained = True

    def _train_logistic(self, X: List[List[float]], y: List[int]) -> None:
        try:
            from sklearn.linear_model import LogisticRegression
            import numpy as np

            model = LogisticRegression(
                class_weight="balanced", max_iter=200, random_state=42
            )
            model.fit(np.array(X), np.array(y))
            self._model = model
            self._model_type = "LogisticRegression"
            # Coeficientes: shape (1, n_features) para clasificación binaria
            self._feature_weights = model.coef_[0].tolist()
        except Exception as e:
            print(f"[WARN] LogisticRegression falló, usando heurística: {e}")
            self._train_heuristic(X, y)

    def _train_heuristic(self, X: List[List[float]], y: List[int]) -> None:
        """Fallback: pesos fijos como heurística documentada."""
        # Pesos alineados con FEATURE_NAMES
        self._feature_weights = [
            0.40,   # risk_score
            0.30,   # tasa_promesas
            0.00,   # promesas_hechas (sin peso directo en heurística)
            0.05,   # ratio_pagado_deuda
            -0.05,  # ratio_pendiente_deuda (mayor pendiente → menos prob)
            -0.10,  # dias_desde_ultimo_contacto (más días → peor)
            0.00,   # total_interacciones
            0.20,   # ratio_pagos_inmediatos
            0.10,   # tiene_promesa_activa
            0.00,   # estado_activo
        ]
        self._model = None
        self._model_type = "heuristica"

    # ------------------------------------------------------------------ #
    #  Predicción                                                          #
    # ------------------------------------------------------------------ #

    def predict(self, cliente_id: str) -> Dict:
        """Retorna la predicción de pago para un cliente."""
        if not self._trained or self._gm is None:
            return self._empty_prediction(cliente_id, "Modelo no entrenado")

        gm = self._gm
        if cliente_id not in gm.clients:
            return self._empty_prediction(cliente_id, "Cliente no encontrado")

        try:
            features = self._build_features(gm, cliente_id)
        except Exception as e:
            return self._empty_prediction(cliente_id, f"Error extrayendo features: {e}")

        # Calcular probabilidad
        prob = self._score(features)

        # Clasificar confianza
        if prob > 0.7 or prob < 0.3:
            confianza = "alta"
        else:
            confianza = "media"

        # Factores positivos y negativos (top 3 por contribución)
        factores_positivos, factores_negativos = self._explain(features)

        return {
            "cliente_id": cliente_id,
            "probabilidad_pago_7d": round(prob, 4),
            "confianza": confianza,
            "factores_positivos": factores_positivos,
            "factores_negativos": factores_negativos,
            "modelo": self._model_type,
            "fecha_prediccion": REFERENCE_DATE.strftime("%Y-%m-%d"),
        }

    def _score(self, features: List[float]) -> float:
        """Calcula la probabilidad de pago [0, 1]."""
        if self._model_type == "LogisticRegression" and self._model is not None:
            try:
                import numpy as np
                prob = self._model.predict_proba(np.array([features]))[0][1]
                return float(prob)
            except Exception:
                pass

        # Heurística ponderada
        score = sum(w * f for w, f in zip(self._feature_weights, features))
        # Normalizar a [0, 1] usando sigmoide suavizada
        score_clipped = max(-3.0, min(3.0, score))
        normalized = (score_clipped + 3.0) / 6.0
        return round(normalized, 4)

    def _explain(
        self, features: List[float]
    ) -> Tuple[List[str], List[str]]:
        """
        Identifica los 3 features con mayor contribución positiva
        y los 3 con mayor contribución negativa al score.
        """
        LABELS = {
            "risk_score": "Risk score elevado",
            "tasa_promesas": "Alta tasa de promesas cumplidas",
            "promesas_hechas": "Múltiples promesas registradas",
            "ratio_pagado_deuda": "Alto porcentaje de deuda pagada",
            "ratio_pendiente_deuda": "Monto pendiente significativo",
            "dias_desde_ultimo_contacto": "Días sin contacto elevado",
            "total_interacciones": "Alto volumen de interacciones",
            "ratio_pagos_inmediatos": "Alta tasa de pagos inmediatos",
            "tiene_promesa_activa": "Tiene promesa de pago activa",
            "estado_activo": "Estado de cuenta activo",
        }

        contributions: List[Tuple[str, float]] = []
        for name, weight, value in zip(FEATURE_NAMES, self._feature_weights, features):
            contributions.append((name, weight * value))

        contributions.sort(key=lambda x: x[1], reverse=True)

        positivos = [LABELS[name] for name, contrib in contributions if contrib > 0][:3]
        negativos = [LABELS[name] for name, contrib in contributions if contrib < 0][:3]

        return positivos, negativos

    @staticmethod
    def _empty_prediction(cliente_id: str, razon: str) -> Dict:
        return {
            "cliente_id": cliente_id,
            "probabilidad_pago_7d": None,
            "confianza": None,
            "factores_positivos": [],
            "factores_negativos": [],
            "modelo": "no_disponible",
            "fecha_prediccion": REFERENCE_DATE.strftime("%Y-%m-%d"),
            "error": razon,
        }
