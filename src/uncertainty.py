import numpy as np

from src.preprocessing import prepare_features


def compute_tree_uncertainty(model, X):
    """Compute RandomForest mean prediction and std across trees."""
    tree_predictions = [tree.predict(X) for tree in model.estimators_]
    tree_predictions = np.array(tree_predictions, dtype=np.float64)

    mean_prediction = float(np.mean(tree_predictions))
    std_prediction = float(np.std(tree_predictions))
    return mean_prediction, std_prediction


def compute_model_uncertainty(bundle, input_dict):
    """Compute uncertainty for one model bundle from raw input dict."""
    X = prepare_features(input_dict, bundle["features"])
    X_scaled = bundle["scaler"].transform(X)
    return compute_tree_uncertainty(bundle["model"], X_scaled)


def compute_risk_score(prediction_value, uncertainty_value):
    """Compute per-model risk score as uncertainty / prediction."""
    prediction = float(prediction_value)
    uncertainty = float(uncertainty_value)

    if prediction <= 0.0:
        raise ValueError("Prediction must be greater than 0 to compute risk score")

    return float(uncertainty / prediction)


def classify_risk(risk_score):
    """Classify risk score into LOW/MEDIUM/HIGH using fixed thresholds."""
    score = float(risk_score)

    if score > 0.015:
        return "HIGH"
    if score >= 0.008:
        return "MEDIUM"
    return "LOW"
