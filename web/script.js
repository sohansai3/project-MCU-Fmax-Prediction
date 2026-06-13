/* ---- Element references ---- */
var resultsDiv = document.getElementById("results");
var errorDiv = document.getElementById("error");
var uploadBtn = document.getElementById("upload-btn");
var downloadBtn = document.getElementById("download-btn");
var randomBtn = document.getElementById("random-btn");
var csvFileInput = document.getElementById("csv-file");
var randomSampleDiv = document.getElementById("random-sample");
var sampleValuesDiv = document.getElementById("sample-values");
var resultsTable = document.getElementById("results-table").querySelector("tbody");
var modelControlsDiv = document.getElementById("model-controls");
var modelRadios = document.querySelectorAll('input[name="model-selector"]');
var modelComparisonDiv = document.getElementById("model-comparison");
var modelCompareTableBody = document.getElementById("model-compare-table").querySelector("tbody");
var modelComparisonChartDiv = document.getElementById("model-comparison-chart");
var riskPanelDiv = document.getElementById("risk-panel");
var nrmseChartDiv = document.getElementById("nrmse-chart");
var envImpactChartDiv = document.getElementById("env-impact-chart");
var themeToggle = document.getElementById("theme-toggle");

var lastUploadedFile = null;
var latestModels = [];
var latestSample = null;
var plotlyReadyPromise = null;
var plotlyErrorShown = false;

function loadExternalScript(src) {
    return new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = function () { resolve(true); };
        script.onerror = function () { reject(new Error("Failed to load: " + src)); };
        document.head.appendChild(script);
    });
}

function ensurePlotly() {
    if (typeof window.Plotly !== "undefined") {
        return Promise.resolve(true);
    }

    if (plotlyReadyPromise) {
        return plotlyReadyPromise;
    }

    plotlyReadyPromise = loadExternalScript("https://cdn.plot.ly/plotly-2.27.0.min.js")
        .catch(function () {
            return loadExternalScript("https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.27.0/plotly.min.js");
        })
        .then(function () {
            return typeof window.Plotly !== "undefined";
        })
        .catch(function () {
            return false;
        });

    return plotlyReadyPromise;
}

function safePlot(targetId, data, layout, config) {
    return ensurePlotly().then(function (ready) {
        if (!ready) {
            if (!plotlyErrorShown) {
                showError("Error: Plotly failed to load. Please check your internet/CSP and refresh.");
                plotlyErrorShown = true;
            }
            return false;
        }

        return Promise.resolve(window.Plotly.newPlot(targetId, data, layout, config)).then(function () {
            return true;
        });
    });
}

function setLoader(id, loading) {
    var el = document.getElementById(id);
    if (!el) return;
    if (loading) {
        el.classList.remove("hidden");
    } else {
        el.classList.add("hidden");
    }
}

function setAllChartLoaders(loading) {
    setLoader("loader-model-comparison", loading);
    setLoader("loader-risk", loading);
    setLoader("loader-nrmse", loading);
    setLoader("loader-env-impact", loading);
}

function getChartTheme() {
    var isDark = document.body.classList.contains("theme-dark");
    if (isDark) {
        return {
            text: "#f3f4f6",
            axis: "#d1d5db",
            grid: "#374151",
            paper: "#0f172a",
            plot: "#111827",
            barPrimary: "#f3f4f6",
            barSecondary: "#9ca3af",
            line: "#f3f4f6"
        };
    }
    return {
        text: "#111827",
        axis: "#1f2937",
        grid: "#d1d5db",
        paper: "#ffffff",
        plot: "#ffffff",
        barPrimary: "#111827",
        barSecondary: "#6b7280",
        line: "#111827"
    };
}

function getSelectedModelName() {
    for (var i = 0; i < modelRadios.length; i++) {
        if (modelRadios[i].checked) return modelRadios[i].value;
    }
    return "";
}

function setSelectedModelName(name) {
    for (var i = 0; i < modelRadios.length; i++) {
        modelRadios[i].checked = modelRadios[i].value === name;
    }
}

function setTheme(isDark) {
    document.body.classList.toggle("theme-dark", isDark);
    if (themeToggle) {
        themeToggle.checked = isDark;
    }
    localStorage.setItem("mcu-theme", isDark ? "dark" : "light");

    if (latestModels.length > 0) {
        var payload = { models: latestModels };
        renderModelComparison(payload);
        renderNRMSEChart(payload);
        renderEnvironmentalGraph();
    }
}

var storedTheme = localStorage.getItem("mcu-theme");
setTheme(storedTheme === "dark");
if (themeToggle) {
    themeToggle.addEventListener("change", function () {
        setTheme(themeToggle.checked);
    });
}

function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.remove("hidden");
}

function clearPredictionUI() {
    errorDiv.classList.add("hidden");
    resultsDiv.classList.add("hidden");
    randomSampleDiv.classList.add("hidden");
    downloadBtn.classList.add("hidden");
    resultsTable.innerHTML = "";
    sampleValuesDiv.innerHTML = "";

    latestModels = [];
    latestSample = null;

    modelControlsDiv.classList.add("hidden");
    modelComparisonDiv.classList.add("hidden");
    modelCompareTableBody.innerHTML = "";

    if (riskPanelDiv) {
        riskPanelDiv.innerHTML = "";
    }

    var existingRisk = document.getElementById("risk_level");
    if (existingRisk) {
        existingRisk.remove();
    }
}

function showRiskLevel(level) {
    var risk = document.getElementById("risk_level");
    if (!risk) {
        risk = document.createElement("div");
        risk.id = "risk_level";
        risk.style.marginTop = "10px";
        risk.style.fontWeight = "600";
        resultsDiv.appendChild(risk);
    }
    risk.innerText = "Risk Level: " + level;
}

function riskRank(level) {
    if (level === "LOW") return 1;
    if (level === "MEDIUM") return 2;
    return 3;
}

function mapModelToResultRow(modelObj) {
    return {
        Predicted_Fmax: modelObj.prediction,
        Uncertainty: modelObj.uncertainty,
        Confidence_Lower: modelObj.lower,
        Confidence_Upper: modelObj.upper,
        Risk_Level: modelObj.risk
    };
}

function getRecommendedModel(models) {
    if (!models || models.length === 0) return null;
    var sorted = models.slice().sort(function (a, b) {
        var riskDelta = riskRank(a.risk) - riskRank(b.risk);
        if (riskDelta !== 0) return riskDelta;
        return Number(a.uncertainty) - Number(b.uncertainty);
    });
    return sorted[0];
}

function selectedModelNameOrDefault(models) {
    if (!models || models.length === 0) return null;
    var selected = getSelectedModelName();
    for (var i = 0; i < models.length; i++) {
        if (models[i].name === selected) return selected;
    }
    return models[models.length - 1].name;
}

function renderModelComparisonTable(models) {
    modelCompareTableBody.innerHTML = "";
    if (!models || models.length === 0) {
        modelComparisonDiv.classList.add("hidden");
        return;
    }

    var recommended = getRecommendedModel(models);

    for (var i = 0; i < models.length; i++) {
        var m = models[i];
        var tr = document.createElement("tr");
        tr.innerHTML =
            "<td>" + m.name + "</td>" +
            "<td>" + Number(m.prediction).toFixed(4) + "</td>" +
            "<td>" + Number(m.uncertainty).toFixed(4) + "</td>" +
            "<td>" + m.risk + "</td>" +
            "<td>" + Number(m.nrmse).toFixed(3) + "</td>" +
            "<td>" + (recommended && m.name === recommended.name ? "<span class='badge-recommended'>Best (Lowest Risk)</span>" : "") + "</td>";
        modelCompareTableBody.appendChild(tr);
    }

    modelComparisonDiv.classList.remove("hidden");
}

function renderResults(rows) {
    resultsTable.innerHTML = "";
    for (var i = 0; i < rows.length; i++) {
        var result = rows[i];
        var predictedValue = result.Predicted_Fmax;
        if (predictedValue === undefined) predictedValue = result.final_prediction;
        if (predictedValue === undefined) predictedValue = result.prediction;

        var lowerValue = result.Confidence_Lower;
        if (lowerValue === undefined) lowerValue = result.lower;
        if (lowerValue === undefined && result.confidence_interval && result.confidence_interval.length > 1) {
            lowerValue = result.confidence_interval[0];
        }

        var upperValue = result.Confidence_Upper;
        if (upperValue === undefined) upperValue = result.upper;
        if (upperValue === undefined && result.confidence_interval && result.confidence_interval.length > 1) {
            upperValue = result.confidence_interval[1];
        }

        var uncertaintyValue = result.Uncertainty;
        if (uncertaintyValue === undefined) uncertaintyValue = result.uncertainty;
        if (uncertaintyValue === undefined && predictedValue !== undefined && upperValue !== undefined) {
            uncertaintyValue = (Number(upperValue) - Number(predictedValue)) / 2;
        }

        var predicted = predictedValue !== undefined ? Number(predictedValue).toFixed(4) : "N/A";
        var uncertainty = uncertaintyValue !== undefined ? Number(uncertaintyValue).toFixed(4) : "N/A";
        var lower = lowerValue !== undefined ? Number(lowerValue).toFixed(4) : "N/A";
        var upper = upperValue !== undefined ? Number(upperValue).toFixed(4) : "N/A";

        var tr = document.createElement("tr");
        tr.innerHTML =
            "<td>" + (i + 1) + "</td>" +
            "<td>" + predicted + "</td>" +
            "<td>" + uncertainty + "</td>" +
            "<td>" + lower + "</td>" +
            "<td>" + upper + "</td>";
        resultsTable.appendChild(tr);
    }
    resultsDiv.classList.remove("hidden");
}

function renderSampleBox(sampleObj) {
    if (!sampleObj) return;
    var keys = Object.keys(sampleObj);
    var html = "";
    for (var i = 0; i < keys.length; i++) {
        html += "<span><strong>" + keys[i] + ":</strong> " + sampleObj[keys[i]] + "</span>";
    }
    sampleValuesDiv.innerHTML = html;
    randomSampleDiv.classList.remove("hidden");
}

function initChartCardFlipState() {
    var cards = document.querySelectorAll(".chart-card.card");
    for (var i = 0; i < cards.length; i++) {
        (function (card) {
            card.addEventListener("mouseenter", function () {
                card.classList.add("is-flipped");
            });

            card.addEventListener("mouseleave", function () {
                card.classList.remove("is-flipped");
            });

            card.addEventListener("pointerdown", function () {
                card.classList.add("is-flipped");
            });
        })(cards[i]);
    }
}

function renderSelectedModel() {
    if (!latestModels || latestModels.length === 0) return;

    var selectedName = getSelectedModelName();
    var chosen = latestModels[0];
    for (var i = 0; i < latestModels.length; i++) {
        if (latestModels[i].name === selectedName) {
            chosen = latestModels[i];
            break;
        }
    }

    renderResults([mapModelToResultRow(chosen)]);
    showRiskLevel(chosen.risk);
}

/* ---- REQUIRED VISUALIZATION FUNCTIONS ---- */
function renderModelComparison(data) {
    setLoader("loader-model-comparison", true);
    var models = data.models || [];
    if (!modelComparisonChartDiv) {
        setLoader("loader-model-comparison", false);
        return;
    }

    if (!models.length) {
        safePlot("model-comparison-chart", [], {
            title: "Model Prediction Comparison",
            annotations: [{
                text: "Generate a prediction to view comparison",
                showarrow: false,
                xref: "paper",
                yref: "paper",
                x: 0.5,
                y: 0.5,
            }],
        }, { responsive: true }).finally(function () {
            setLoader("loader-model-comparison", false);
        });
        return;
    }

    var names = models.map(function (m) { return m.name; });
    var predictions = models.map(function (m) { return Number(m.prediction); });
    var uncertainties = models.map(function (m) { return Number(m.uncertainty); });
    var theme = getChartTheme();

    safePlot("model-comparison-chart", [{
        x: names,
        y: predictions,
        type: "bar",
        marker: { color: theme.barPrimary },
        error_y: {
            type: "data",
            array: uncertainties,
            visible: true,
            color: theme.barSecondary,
            thickness: 1.3,
            width: 5,
        },
        text: predictions.map(function (v) { return v.toFixed(4); }),
        textposition: "outside",
    }], {
        title: "Model Prediction Comparison",
        paper_bgcolor: theme.paper,
        plot_bgcolor: theme.plot,
        font: { color: theme.text },
        xaxis: { title: "Model", color: theme.axis, gridcolor: theme.grid },
        yaxis: { title: "Prediction (GHz)", rangemode: "tozero", color: theme.axis, gridcolor: theme.grid },
        margin: { t: 50, b: 80 },
    }, { responsive: true }).finally(function () {
        setLoader("loader-model-comparison", false);
    });
}

function renderRiskPanel(data) {
    setLoader("loader-risk", true);
    var models = data.models || [];
    if (!riskPanelDiv) return;

    riskPanelDiv.innerHTML = "";
    for (var i = 0; i < models.length; i++) {
        var m = models[i];
        var riskClass = "risk-medium";
        if (m.risk === "HIGH") riskClass = "risk-high";
        if (m.risk === "LOW") riskClass = "risk-low";

        var card = document.createElement("div");
        card.className = "risk-card";
        card.innerHTML =
            "<h4>" + m.name + "</h4>" +
            "<p><strong>Prediction:</strong> " + Number(m.prediction).toFixed(4) + " GHz</p>" +
            "<p><strong>Risk:</strong> <span class='risk-pill " + riskClass + "'>" + m.risk + "</span></p>";
        riskPanelDiv.appendChild(card);
    }
    setLoader("loader-risk", false);
}

function renderNRMSEChart(data) {
    setLoader("loader-nrmse", true);
    var models = data.models || [];
    if (!nrmseChartDiv) {
        setLoader("loader-nrmse", false);
        return;
    }

    if (!models.length) {
        safePlot("nrmse-chart", [], {
            title: "Model Accuracy Comparison (nRMSE)",
            annotations: [{
                text: "Generate a prediction to view nRMSE comparison",
                showarrow: false,
                xref: "paper",
                yref: "paper",
                x: 0.5,
                y: 0.5,
            }],
        }, { responsive: true }).finally(function () {
            setLoader("loader-nrmse", false);
        });
        return;
    }

    var names = models.map(function (m) { return m.name; });
    var nrmsePct = models.map(function (m) { return Number(m.nrmse) * 100; });

    var minValue = Math.min.apply(null, nrmsePct);
    var theme = getChartTheme();
    var colors = nrmsePct.map(function (v) {
        return v === minValue ? theme.barPrimary : theme.barSecondary;
    });

    safePlot("nrmse-chart", [{
        x: names,
        y: nrmsePct,
        type: "bar",
        marker: { color: colors },
        text: nrmsePct.map(function (v) { return v.toFixed(2) + "%"; }),
        textposition: "outside",
    }], {
        title: "Model Accuracy Comparison (nRMSE)",
        paper_bgcolor: theme.paper,
        plot_bgcolor: theme.plot,
        font: { color: theme.text },
        xaxis: { title: "Model", color: theme.axis, gridcolor: theme.grid },
        yaxis: { title: "nRMSE (%)", rangemode: "tozero", color: theme.axis, gridcolor: theme.grid },
        margin: { t: 50, b: 80 },
    }, { responsive: true }).finally(function () {
        setLoader("loader-nrmse", false);
    });
}

function renderEnvironmentalGraph() {
    setLoader("loader-env-impact", true);
    if (!envImpactChartDiv) {
        setLoader("loader-env-impact", false);
        return;
    }
    if (!latestSample || !latestModels || latestModels.length === 0) {
        safePlot("env-impact-chart", [], {
            title: "Environmental Impact on Fmax",
            annotations: [{
                text: "Generate a random sample to view environmental impact",
                showarrow: false,
                xref: "paper",
                yref: "paper",
                x: 0.5,
                y: 0.5,
            }],
        }, { responsive: true }).finally(function () {
            setLoader("loader-env-impact", false);
        });
        return;
    }

    var selectedName = selectedModelNameOrDefault(latestModels);
    var theme = getChartTheme();
    var temperatures = [];
    for (var t = 20; t <= 50; t += 2) {
        temperatures.push(t);
    }

    var requests = temperatures.map(function (temp) {
        var payload = {};
        for (var key in latestSample) {
            if (Object.prototype.hasOwnProperty.call(latestSample, key)) {
                payload[key] = latestSample[key];
            }
        }
        payload.Env_temperature = temp;

        return fetch("/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                var models = resp.models || [];
                for (var i = 0; i < models.length; i++) {
                    if (models[i].name === selectedName) {
                        return Number(models[i].prediction);
                    }
                }
                return Number(models[models.length - 1].prediction);
            });
    });

    Promise.all(requests)
        .then(function (predictions) {
            return safePlot("env-impact-chart", [{
                x: temperatures,
                y: predictions,
                type: "scatter",
                mode: "lines+markers",
                line: { color: theme.line, width: 3 },
                marker: { size: 7 },
                name: selectedName,
            }], {
                title: "Environmental Impact on Fmax",
                paper_bgcolor: theme.paper,
                plot_bgcolor: theme.plot,
                font: { color: theme.text },
                xaxis: { title: "Temperature (C)", color: theme.axis, gridcolor: theme.grid },
                yaxis: { title: "Predicted Fmax (GHz)", color: theme.axis, gridcolor: theme.grid },
                margin: { t: 50, b: 60 },
            }, { responsive: true });
        })
        .catch(function () {
            return safePlot("env-impact-chart", [], {
                title: "Environmental Impact on Fmax",
                annotations: [{
                    text: "Unable to compute environmental impact",
                    showarrow: false,
                    xref: "paper",
                    yref: "paper",
                    x: 0.5,
                    y: 0.5,
                }],
            }, { responsive: true });
        })
        .finally(function () {
            setLoader("loader-env-impact", false);
        });
}

for (var radioIndex = 0; radioIndex < modelRadios.length; radioIndex++) {
    modelRadios[radioIndex].addEventListener("change", function () {
        renderSelectedModel();
        renderEnvironmentalGraph();
    });
}

/* ---- CSV Upload ---- */
uploadBtn.addEventListener("click", function () {
    clearPredictionUI();
    setAllChartLoaders(true);
    var file = csvFileInput.files[0];
    if (!file) { showError("Please select a CSV file first."); return; }

    lastUploadedFile = file;
    var formData = new FormData();
    formData.append("file", file);

    fetch("/predict-csv", { method: "POST", body: formData })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data.error) { showError(data.error); return; }
            renderResults(data.results);
            downloadBtn.classList.remove("hidden");

            if (data.sample) {
                latestSample = data.sample;
                renderSampleBox(data.sample);
            }

            if (Array.isArray(data.models) && data.models.length > 0) {
                latestModels = data.models;

                var recommended = getRecommendedModel(latestModels);
                if (recommended) {
                    setSelectedModelName(recommended.name);
                }

                modelControlsDiv.classList.remove("hidden");
                renderModelComparisonTable(latestModels);
                renderSelectedModel();

                renderModelComparison({ models: latestModels });
                renderRiskPanel({ models: latestModels });
                renderNRMSEChart({ models: latestModels });
                renderEnvironmentalGraph();
            } else {
                modelControlsDiv.classList.add("hidden");
                modelComparisonDiv.classList.add("hidden");

                renderModelComparison({ models: [] });
                renderRiskPanel({ models: [] });
                renderNRMSEChart({ models: [] });
                renderEnvironmentalGraph();
            }
        })
        .catch(function (err) { showError("Error: " + err.message); });
});

/* ---- Download CSV ---- */
downloadBtn.addEventListener("click", function () {
    if (!lastUploadedFile) return;
    var formData = new FormData();
    formData.append("file", lastUploadedFile);

    fetch("/download-csv", { method: "POST", body: formData })
        .then(function (res) { return res.blob(); })
        .then(function (blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = "predictions.csv";
            a.click();
            URL.revokeObjectURL(url);
        })
        .catch(function (err) { showError("Download error: " + err.message); });
});

/* ---- Random Sample ---- */
randomBtn.addEventListener("click", function () {
    clearPredictionUI();
    setAllChartLoaders(true);

    fetch("/predict-random")
        .then(function (res) { return res.json(); })
        .then(function (data) {
            console.log("API response:", data);

            if (data.sample) {
                latestSample = data.sample;
                renderSampleBox(data.sample);
            }

            if (Array.isArray(data.models)) {
                latestModels = data.models;

                var recommended = getRecommendedModel(latestModels);
                if (recommended) {
                    setSelectedModelName(recommended.name);
                }

                modelControlsDiv.classList.remove("hidden");
                renderModelComparisonTable(latestModels);
                renderSelectedModel();

                renderModelComparison(data);
                renderRiskPanel(data);
                renderNRMSEChart(data);
                renderEnvironmentalGraph();
                return;
            }

            var rows = Array.isArray(data.results) ? data.results : [data];
            renderResults(rows);

            var riskLevel = data.risk_level;
            if (riskLevel === undefined && rows.length > 0) {
                riskLevel = rows[0].Risk_Level || rows[0].risk_level;
            }
            if (riskLevel !== undefined) {
                showRiskLevel(riskLevel);
            }

            modelControlsDiv.classList.add("hidden");
            modelComparisonDiv.classList.add("hidden");
            renderModelComparison({ models: [] });
            renderRiskPanel({ models: [] });
            renderNRMSEChart({ models: [] });
            renderEnvironmentalGraph();
        })
        .catch(function (err) { showError("Error: " + err.message); });
});

/* Initial placeholders */
renderModelComparison({ models: [] });
renderRiskPanel({ models: [] });
renderNRMSEChart({ models: [] });
renderEnvironmentalGraph();
initChartCardFlipState();
