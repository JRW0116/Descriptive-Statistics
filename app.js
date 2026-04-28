const datasetInput = document.getElementById("datasetInput");
const datasetStatus = document.getElementById("datasetStatus");
const overviewGrid = document.getElementById("overviewGrid");
const messageBox = document.getElementById("messageBox");
const summaryTableBody = document.querySelector("#summaryTable tbody");
const columnSelect = document.getElementById("columnSelect");
const detailStats = document.getElementById("detailStats");

let currentNumericSummaries = [];

datasetInput.addEventListener("change", handleFileSelection);
columnSelect.addEventListener("change", handleColumnSelection);

async function handleFileSelection(event) {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  datasetStatus.textContent = "Reading file";
  messageBox.textContent = "Loading your dataset and detecting columns.";

  try {
    const rawText = await file.text();
    const parsed = parseDelimitedText(rawText, file.name);
    const summaries = buildNumericSummaries(parsed.rows, parsed.headers);

    currentNumericSummaries = summaries;
    renderOverview(parsed, summaries);
    renderSummaryTable(summaries);
    renderColumnSelect(summaries);

    if (summaries.length > 0) {
      columnSelect.value = summaries[0].name;
      renderDetailStats(summaries[0]);
    } else {
      renderEmptyDetails("No numeric columns were detected in this dataset.");
    }

    datasetStatus.textContent = `Loaded: ${file.name}`;
    messageBox.textContent = summaries.length > 0
      ? "Select any numeric column to inspect a fuller set of descriptive statistics."
      : "The file loaded successfully, but no numeric columns were found for descriptive statistics.";
  } catch (error) {
    datasetStatus.textContent = "Could not analyze";
    messageBox.textContent = error.message;
    renderOverview({
      rows: [],
      headers: [],
      missingValues: 0
    }, []);
    renderSummaryTable([]);
    renderColumnSelect([]);
    renderEmptyDetails("Upload a clean CSV or TSV file to continue.");
  }
}

function parseDelimitedText(rawText, fileName) {
  const cleanText = rawText.replace(/^\uFEFF/, "").trim();
  if (!cleanText) {
    throw new Error("The uploaded file is empty.");
  }

  const lines = cleanText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("The file needs a header row and at least one data row.");
  }

  const delimiter = detectDelimiter(lines[0], fileName);
  const headers = splitDelimitedLine(lines[0], delimiter).map((header, index) => {
    const label = header.trim();
    return label || `Column ${index + 1}`;
  });

  const rows = [];
  let missingValues = 0;

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitDelimitedLine(lines[index], delimiter);
    const row = {};

    headers.forEach((header, columnIndex) => {
      const value = (values[columnIndex] ?? "").trim();
      row[header] = value;
      if (value === "") {
        missingValues += 1;
      }
    });

    rows.push(row);
  }

  return { headers, rows, missingValues };
}

function detectDelimiter(headerLine, fileName) {
  if (fileName.toLowerCase().endsWith(".tsv")) {
    return "\t";
  }

  const commaCount = (headerLine.match(/,/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;

  return tabCount > commaCount ? "\t" : ",";
}

function splitDelimitedLine(line, delimiter) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function buildNumericSummaries(rows, headers) {
  return headers.map((header) => {
    const columnValues = rows.map((row) => row[header]);
    const numericValues = columnValues
      .map(normalizeNumber)
      .filter((value) => Number.isFinite(value));

    if (numericValues.length === 0) {
      return null;
    }

    numericValues.sort((a, b) => a - b);
    const missing = columnValues.length - numericValues.length;
    const mean = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    const median = percentile(numericValues, 0.5);
    const q1 = percentile(numericValues, 0.25);
    const q3 = percentile(numericValues, 0.75);
    const min = numericValues[0];
    const max = numericValues[numericValues.length - 1];
    const range = max - min;
    const variance = numericValues.length > 1
      ? numericValues.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (numericValues.length - 1)
      : 0;
    const standardDeviation = Math.sqrt(variance);

    return {
      name: header,
      count: numericValues.length,
      missing,
      mean,
      median,
      mode: findModes(numericValues),
      min,
      max,
      range,
      q1,
      q3,
      iqr: q3 - q1,
      variance,
      standardDeviation,
      sum: numericValues.reduce((sum, value) => sum + value, 0)
    };
  }).filter(Boolean);
}

function normalizeNumber(value) {
  if (value === "") {
    return Number.NaN;
  }

  const normalized = value.replace(/[$,%\s]/g, "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position = (sortedValues.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function findModes(values) {
  const counts = new Map();
  let maxCount = 0;

  values.forEach((value) => {
    const count = (counts.get(value) || 0) + 1;
    counts.set(value, count);
    maxCount = Math.max(maxCount, count);
  });

  if (maxCount === 1) {
    return "No repeated values";
  }

  return [...counts.entries()]
    .filter(([, count]) => count === maxCount)
    .map(([value]) => formatNumber(value))
    .join(", ");
}

function renderOverview(parsed, summaries) {
  const metrics = [
    { label: "Rows", value: parsed.rows.length },
    { label: "Columns", value: parsed.headers.length },
    { label: "Numeric fields", value: summaries.length },
    { label: "Missing values", value: parsed.missingValues }
  ];

  overviewGrid.classList.remove("empty-state");
  overviewGrid.innerHTML = metrics.map((metric) => `
    <article class="metric-card">
      <span class="metric-label">${metric.label}</span>
      <strong class="metric-value">${metric.value}</strong>
    </article>
  `).join("");
}

function renderSummaryTable(summaries) {
  if (summaries.length === 0) {
    summaryTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="placeholder-cell">No numeric columns detected.</td>
      </tr>
    `;
    return;
  }

  summaryTableBody.innerHTML = summaries.map((summary) => `
    <tr>
      <td>${summary.name}</td>
      <td>${summary.count}</td>
      <td>${formatNumber(summary.mean)}</td>
      <td>${formatNumber(summary.median)}</td>
      <td>${formatNumber(summary.standardDeviation)}</td>
      <td>${formatNumber(summary.min)}</td>
      <td>${formatNumber(summary.max)}</td>
    </tr>
  `).join("");
}

function renderColumnSelect(summaries) {
  if (summaries.length === 0) {
    columnSelect.innerHTML = "<option>Select a numeric column</option>";
    columnSelect.disabled = true;
    return;
  }

  columnSelect.disabled = false;
  columnSelect.innerHTML = summaries.map((summary) => `
    <option value="${summary.name}">${summary.name}</option>
  `).join("");
}

function handleColumnSelection(event) {
  const selectedSummary = currentNumericSummaries.find((summary) => summary.name === event.target.value);
  if (selectedSummary) {
    renderDetailStats(selectedSummary);
  }
}

function renderDetailStats(summary) {
  detailStats.classList.remove("empty-detail");
  const cards = [
    ["Valid values", summary.count],
    ["Missing values", summary.missing],
    ["Mean", formatNumber(summary.mean)],
    ["Median", formatNumber(summary.median)],
    ["Mode", summary.mode],
    ["Minimum", formatNumber(summary.min)],
    ["Maximum", formatNumber(summary.max)],
    ["Range", formatNumber(summary.range)],
    ["Q1", formatNumber(summary.q1)],
    ["Q3", formatNumber(summary.q3)],
    ["IQR", formatNumber(summary.iqr)],
    ["Variance", formatNumber(summary.variance)],
    ["Std. deviation", formatNumber(summary.standardDeviation)],
    ["Sum", formatNumber(summary.sum)]
  ];

  detailStats.innerHTML = cards.map(([label, value]) => `
    <article class="detail-card">
      <span class="detail-label">${label}</span>
      <strong class="detail-value">${value}</strong>
    </article>
  `).join("");
}

function renderEmptyDetails(message) {
  detailStats.classList.add("empty-detail");
  detailStats.innerHTML = `
    <article class="detail-card">
      <span class="detail-label">${message}</span>
      <strong class="detail-value">-</strong>
    </article>
  `;
}

function formatNumber(value) {
  if (typeof value === "number") {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 4
    }).format(value);
  }

  return value;
}
