import numpy as np

FEATURE_NAMES = [f"SMON{i}" for i in range(1, 28)] + [
    "Env_voltage",
    "Env_frequency",
    "Env_temperature",
]


def prepare_features(input_dict, feature_list):
    """Validate, order, and convert input features to model-ready numeric array."""
    if not isinstance(input_dict, dict):
        raise ValueError("Input must be a dictionary of feature_name -> value")

    missing = [name for name in feature_list if name not in input_dict]
    if missing:
        raise ValueError(f"Missing required features: {missing}")

    ordered_values = []
    for name in feature_list:
        try:
            ordered_values.append(float(input_dict[name]))
        except (TypeError, ValueError):
            raise ValueError(f"Feature '{name}' must be numeric")

    return np.array(ordered_values, dtype=np.float64).reshape(1, len(feature_list))
