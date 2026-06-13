import os
import joblib

from src.preprocessing import prepare_features

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def _load_bundle(filename):
    bundle_path = os.path.join(MODELS_DIR, filename)
    bundle = joblib.load(bundle_path)
    required_keys = ["model", "scaler", "features"]
    missing = [k for k in required_keys if k not in bundle]
    if missing:
        raise ValueError(f"Bundle '{filename}' missing keys: {missing}")
    return bundle


BUNDLES = {
    "smon_only": _load_bundle("model_smon_bundle.pkl"),
    "env_model": _load_bundle("model_env_bundle.pkl"),
    "cluster_model": _load_bundle("model_cluster_bundle.pkl"),
}


def predict_single(bundle, input_dict):
    """Predict a single sample using one bundle and its feature contract."""
    X = prepare_features(input_dict, bundle["features"])
    X_scaled = bundle["scaler"].transform(X)
    prediction = bundle["model"].predict(X_scaled)
    return float(prediction[0])


def predict_all(input_dict):
    """Run all model bundles for one input sample."""
    return {
        "smon_only": predict_single(BUNDLES["smon_only"], input_dict),
        "env_model": predict_single(BUNDLES["env_model"], input_dict),
        "cluster_model": predict_single(BUNDLES["cluster_model"], input_dict),
    }
