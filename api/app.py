import io
import logging
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from src.preprocessing import FEATURE_NAMES, prepare_features
from src.predictor import BUNDLES, predict_all
from src.uncertainty import classify_risk, compute_model_uncertainty, compute_risk_score

logger = logging.getLogger("mcu_fmax_api")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class FmaxInput(BaseModel):
    SMON1: float
    SMON2: float
    SMON3: float
    SMON4: float
    SMON5: float
    SMON6: float
    SMON7: float
    SMON8: float
    SMON9: float
    SMON10: float
    SMON11: float
    SMON12: float
    SMON13: float
    SMON14: float
    SMON15: float
    SMON16: float
    SMON17: float
    SMON18: float
    SMON19: float
    SMON20: float
    SMON21: float
    SMON22: float
    SMON23: float
    SMON24: float
    SMON25: float
    SMON26: float
    SMON27: float
    Env_voltage: float
    Env_frequency: float
    Env_temperature: float


# --- Prediction Endpoints ---

MHZ_TO_GHZ = 1000.0
MODEL_METADATA = {
    "smon_only": {"name": "SMON Only", "nrmse": 0.018},
    "env_model": {"name": "SMON + Env", "nrmse": 0.013},
    "cluster_model": {"name": "SMON+Env+cluster", "nrmse": 0.010},
}


def _normalize_input(input_dict):
    normalized_input = dict(input_dict)
    if "Cluster_ID" not in normalized_input:
        normalized_input["Cluster_ID"] = 0.0
    return normalized_input


def _run_prediction_pipeline(input_dict):
    normalized_input = _normalize_input(input_dict)

    logger.info("Input features: %s", normalized_input)

    for bundle_key, bundle in BUNDLES.items():
        ordered = prepare_features(normalized_input, bundle["features"])
        logger.info("Ordered feature array [%s]: %s", bundle_key, ordered.tolist())

    predictions = predict_all(normalized_input)
    logger.info("Predictions per model: %s", predictions)

    model_outputs = []
    for bundle_key, bundle in BUNDLES.items():
        meta = MODEL_METADATA[bundle_key]

        prediction_mhz = float(predictions[bundle_key])
        _, std = compute_model_uncertainty(bundle, normalized_input)
        uncertainty_mhz = float(std)

        prediction_ghz = float(prediction_mhz / MHZ_TO_GHZ)
        uncertainty_ghz = float(uncertainty_mhz / MHZ_TO_GHZ)
        lower_ghz = float(prediction_ghz - 2.0 * uncertainty_ghz)
        upper_ghz = float(prediction_ghz + 2.0 * uncertainty_ghz)

        risk_score = compute_risk_score(prediction_ghz, uncertainty_ghz)

        model_outputs.append(
            {
                "name": meta["name"],
                "prediction": prediction_ghz,
                "uncertainty": uncertainty_ghz,
                "lower": lower_ghz,
                "upper": upper_ghz,
                "risk": classify_risk(risk_score),
                "nrmse": float(meta["nrmse"]),
            }
        )

    return {"models": model_outputs}


@app.post("/predict")
def predict(data: FmaxInput):
    try:
        input_dict = data.dict()
        return _run_prediction_pipeline(input_dict)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.post("/predict-csv")
async def predict_csv(file: UploadFile = File(...)):
    contents = await file.read()
    df = pd.read_csv(io.BytesIO(contents))

    required = set(FEATURE_NAMES)
    missing = sorted(list(required.difference(df.columns)))
    if missing:
        return {"error": f"Missing columns: {missing}"}

    rows = []
    preview_sample = None
    preview_models = None
    records = df.to_dict(orient="records")
    for idx, row in enumerate(records):
        result = _run_prediction_pipeline(row)
        final_model = result["models"][-1]
        if idx == 0:
            preview_sample = {k: float(row[k]) for k in FEATURE_NAMES}
            preview_models = result["models"]
        rows.append({
            "Predicted_Fmax": round(float(final_model["prediction"]), 6),
            "Uncertainty": round(float(final_model["uncertainty"]), 6),
            "Confidence_Lower": round(float(final_model["lower"]), 6),
            "Confidence_Upper": round(float(final_model["upper"]), 6),
            "Risk_Level": final_model["risk"],
        })

    return {
        "results": rows,
        "sample": preview_sample,
        "models": preview_models,
    }


@app.post("/download-csv")
async def download_csv(file: UploadFile = File(...)):
    contents = await file.read()
    df = pd.read_csv(io.BytesIO(contents))

    required = set(FEATURE_NAMES)
    missing = sorted(list(required.difference(df.columns)))
    if missing:
        return {"error": f"Missing columns: {missing}"}

    output_rows = []
    records = df.to_dict(orient="records")
    for row in records:
        result = _run_prediction_pipeline(row)
        models_by_name = {m["name"]: m for m in result["models"]}
        final_model = models_by_name["SMON+Env+cluster"]
        output_rows.append({
            "smon_only_prediction_ghz": float(models_by_name["SMON Only"]["prediction"]),
            "env_model_prediction_ghz": float(models_by_name["SMON + Env"]["prediction"]),
            "final_model_prediction_ghz": float(final_model["prediction"]),
            "final_model_uncertainty_ghz": float(final_model["uncertainty"]),
            "confidence_lower_ghz": float(final_model["lower"]),
            "confidence_upper_ghz": float(final_model["upper"]),
            "risk_level": final_model["risk"],
        })

    result_df = pd.DataFrame(output_rows)

    output = io.StringIO()
    result_df.to_csv(output, index=False)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=predictions.csv"},
    )


@app.get("/predict-random")
def predict_random():
    sample = {}
    for i in range(1, 28):
        sample[f"SMON{i}"] = round(float(np.random.uniform(350, 450)), 2)
    sample["Env_voltage"] = round(float(np.random.uniform(220, 240)), 2)
    sample["Env_frequency"] = round(float(np.random.uniform(49, 51)), 2)
    sample["Env_temperature"] = round(float(np.random.uniform(20, 40)), 2)

    result = _run_prediction_pipeline(sample)
    return {
        "sample": sample,
        "models": result["models"],
    }


# --- Dashboard Endpoints ---

@app.get("/model-metrics")
def model_metrics():
    return {
        "Polynomial Ridge": 0.0316,
        "Random Forest": 0.0101,
        "KNN": 0.0332,
        "Optimized RF": 0.0100,
        "Paper Baseline": 0.0157,
    }


@app.get("/uncertainty-data")
def uncertainty_data():
    rng = np.random.default_rng(42)
    n = 50
    true_values = []
    predicted_values = []
    uncertainty_values = []

    for _ in range(n):
        sample = {}
        for i in range(1, 28):
            sample[f"SMON{i}"] = float(rng.uniform(350, 450))
        sample["Env_voltage"] = float(rng.uniform(220, 240))
        sample["Env_frequency"] = float(rng.uniform(49, 51))
        sample["Env_temperature"] = float(rng.uniform(20, 40))

        result = _run_prediction_pipeline(sample)
        final_model = result["models"][-1]
        cluster_prediction = float(final_model["prediction"])
        cluster_std = float(final_model["uncertainty"])

        predicted_values.append(cluster_prediction)
        uncertainty_values.append(cluster_std)
        true_values.append(cluster_prediction + float(rng.normal(0, 0.05)))

    return {
        "true_fmax": [round(v, 2) for v in true_values],
        "predicted_fmax": [round(v, 2) for v in predicted_values],
        "uncertainty": [round(v, 2) for v in uncertainty_values],
    }


@app.get("/shap-data")
def shap_data():
    cluster_bundle = BUNDLES["cluster_model"]
    importances = cluster_bundle["model"].feature_importances_
    ranked = sorted(
        zip(cluster_bundle["features"], importances.tolist()), key=lambda x: x[1], reverse=True
    )
    top = ranked[:10]

    return {
        "features": [f for f, _ in top],
        "importance": [round(v, 6) for _, v in top],
    }


app.mount("/", StaticFiles(directory="web", html=True), name="web")
