"""
config.py — Constantes compartidas entre módulos del backend.
"""

from datetime import datetime, timezone

# Fecha de referencia = fecha de generación del dataset.
# Usada para determinar si una promesa de pago está vencida.
REFERENCE_DATE = datetime(2025, 8, 12, tzinfo=timezone.utc)
REFERENCE_DATE_STR = REFERENCE_DATE.strftime("%Y-%m-%d")  # "2025-08-12"
