# MCU Fmax Prediction System

## Overview

The MCU Fmax Prediction System is a Machine Learning inference application designed to predict the maximum operating frequency (Fmax) of a Microcontroller Unit (MCU) using a pre-trained Random Forest Regression model.

The model has been trained previously and exported from Google Colab. This project focuses exclusively on model inference and does not perform any model training or retraining.

The application provides:

* FastAPI-based REST API
* Machine Learning inference using scikit-learn
* Prediction uncertainty estimation
* Simple web-based user interface
* Real-time Fmax prediction

---

## Technologies Used

* Python
* FastAPI
* scikit-learn
* NumPy
* Pandas
* Joblib

---

## Project Structure

```text
MCU_Fmax_Predictor/

├── models/
│   └── rf_fmax_model.pkl

├── src/
│   ├── preprocessing.py
│   ├── predictor.py
│   └── uncertainty.py

├── api/
│   └── app.py

├── web/
│   ├── index.html
│   ├── script.js
│   └── style.css

└── requirements.txt
```

---

## Model Information

The prediction model is a pre-trained RandomForestRegressor stored in:

```text
models/rf_fmax_model.pkl
```

The model is loaded using Joblib and used only for inference.

No retraining is performed within this project.

---

## Input Features

The system accepts 30 input features in the following order:

### Sensor Features

SMON1, SMON2, SMON3, SMON4, SMON5, SMON6, SMON7, SMON8, SMON9, SMON10, SMON11, SMON12, SMON13, SMON14, SMON15, SMON16, SMON17, SMON18, SMON19, SMON20, SMON21, SMON22, SMON23, SMON24, SMON25, SMON26, SMON27

### Environmental Features

* Env_voltage
* Env_frequency
* Env_temperature

### Total Features

30

---

## Target Variable

The system predicts:

```text
Fmax
```

which represents the maximum operating frequency of the MCU.

---

## Core Components

### preprocessing.py

Responsibilities:

* Validate exactly 30 input features
* Convert input to NumPy array
* Reshape data to (1, 30)
* Prepare input for model inference

Function:

```python
prepare_input(features)
```

---

### predictor.py

Responsibilities:

* Load Random Forest model
* Store model globally
* Perform Fmax prediction

Function:

```python
predict_fmax(features)
```

Workflow:

1. Receive feature values
2. Call preprocessing module
3. Generate prediction using model.predict()
4. Return predicted Fmax

---

### uncertainty.py

Responsibilities:

* Estimate prediction uncertainty
* Use individual Random Forest tree predictions
* Calculate standard deviation
* Generate confidence interval

Returns:

* Mean Prediction
* Uncertainty
* Confidence Interval

Formula:

```text
Confidence Interval = Mean ± Standard Deviation
```

---

### FastAPI Backend

Endpoint:

```http
POST /predict
```

Example Request:

```json
{
  "SMON1": 410,
  "SMON2": 398,
  "SMON3": 402,
  "SMON27": 421,
  "Env_voltage": 231,
  "Env_frequency": 50.1,
  "Env_temperature": 32
}
```

Example Response:

```json
{
  "predicted_fmax": 425.6,
  "uncertainty": 4.3,
  "confidence_interval": [
    421.3,
    429.9
  ]
}
```

---

## Web Interface

The web application provides:

* 30 input fields
* Predict button
* Real-time API communication
* Prediction display
* Uncertainty display
* Confidence interval display

Users can enter MCU sensor values and environmental parameters and instantly receive an Fmax prediction.

---

## Installation

Clone the repository:

```bash
git clone https://github.com/sohansai3/project-MCU-Fmax-Prediction.git
cd project-MCU-Fmax-Prediction
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

## Run the Application

Start the FastAPI server:

```bash
uvicorn api.app:app --reload
```

Default server:

```text
http://127.0.0.1:8000
```

API Documentation:

```text
http://127.0.0.1:8000/docs
```

---

## Features

* Random Forest based prediction
* Fast inference
* Prediction uncertainty estimation
* Confidence interval generation
* FastAPI backend
* Simple web interface
* Easy deployment
* Lightweight architecture

---

## Future Enhancements

* Model version management
* Batch prediction support
* CSV upload functionality
* Advanced visualization dashboard
* Model monitoring and analytics

---

## Conclusion

The MCU Fmax Prediction System provides an efficient and reliable solution for predicting maximum MCU operating frequency using a pre-trained Random Forest model. The system combines machine learning inference, uncertainty estimation, REST API services, and a user-friendly web interface to deliver accurate and interpretable predictions.
