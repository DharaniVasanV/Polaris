"""
POLARIS Weather Postprocessing Module.
Clamps risk scores to [0, 1] and deterministically maps continuous scores to
operational risk classes (SAFE, MODERATE, HIGH, CRITICAL).
"""

import numpy as np

RISK_CLASSES = ["SAFE", "MODERATE", "HIGH", "CRITICAL"]

def clamp_risk_score(score):
    """
    Clamps continuous prediction score to [0.0, 1.0].
    Supports float or numpy array.
    """
    return np.clip(score, 0.0, 1.0)

def classify_risk(score):
    """
    Maps continuous weather risk score to categorical risk class:
    - SAFE:     [0.00, 0.25)
    - MODERATE: [0.25, 0.50)
    - HIGH:     [0.50, 0.75)
    - CRITICAL: [0.75, 1.00]
    """
    arr = np.asarray(score)
    is_scalar = arr.ndim == 0
    arr = np.atleast_1d(arr)

    classes = np.empty(arr.shape, dtype=object)
    classes[arr < 0.25] = "SAFE"
    classes[(arr >= 0.25) & (arr < 0.50)] = "MODERATE"
    classes[(arr >= 0.50) & (arr < 0.75)] = "HIGH"
    classes[arr >= 0.75] = "CRITICAL"

    return classes.item() if is_scalar else classes

def get_risk_code(score):
    """
    Maps continuous score to integer code:
    0: SAFE, 1: MODERATE, 2: HIGH, 3: CRITICAL.
    """
    arr = np.asarray(score)
    is_scalar = arr.ndim == 0
    arr = np.atleast_1d(arr)

    codes = np.zeros(arr.shape, dtype=int)
    codes[(arr >= 0.25) & (arr < 0.50)] = 1
    codes[(arr >= 0.50) & (arr < 0.75)] = 2
    codes[arr >= 0.75] = 3

    return int(codes.item()) if is_scalar else codes
