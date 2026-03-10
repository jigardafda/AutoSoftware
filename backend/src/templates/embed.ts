export interface EmbedConfigData {
  title: string;
  welcomeMessage: string | null;
  logoUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  fontFamily: string;
  maxFileSize: number;
  maxTotalSize: number;
  allowedFileTypes: string[];
  language: string;
  projectId: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmbedPage(config: EmbedConfigData, projectName: string): string {
  const e = {
    title: escapeHtml(config.title),
    welcomeMessage: config.welcomeMessage ? escapeHtml(config.welcomeMessage) : null,
    logoUrl: config.logoUrl ? escapeHtml(config.logoUrl) : null,
    primaryColor: escapeHtml(config.primaryColor),
    backgroundColor: escapeHtml(config.backgroundColor),
    textColor: escapeHtml(config.textColor),
    fontFamily: escapeHtml(config.fontFamily),
    projectName: escapeHtml(projectName),
    projectId: escapeHtml(config.projectId),
    borderRadius: config.borderRadius,
    maxFileSize: config.maxFileSize,
    maxTotalSize: config.maxTotalSize,
    allowedFileTypes: config.allowedFileTypes,
    language: escapeHtml(config.language),
  };

  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(config.fontFamily)}:wght@400;500;600&display=swap`;

  return `<!DOCTYPE html>
<html lang="${e.language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${e.title} - ${e.projectName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${escapeHtml(fontUrl)}" rel="stylesheet">
  <style>
    :root {
      --primary: ${e.primaryColor};
      --bg: ${e.backgroundColor};
      --text: ${e.textColor};
      --radius: ${e.borderRadius}px;
      --font: '${e.fontFamily}', sans-serif;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .container {
      width: 100%;
      max-width: 640px;
      background: #ffffff;
      border-radius: var(--radius);
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 8px 30px rgba(0,0,0,0.06);
      overflow: hidden;
      position: relative;
    }

    .header {
      padding: 24px 28px 16px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .header-logo {
      height: 36px;
      width: auto;
      border-radius: 6px;
      flex-shrink: 0;
    }

    .header-text h1 {
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
      margin: 0;
    }

    .header-text p {
      font-size: 13px;
      color: #888;
      margin: 2px 0 0;
    }

    .step {
      display: none;
      padding: 28px;
      animation: fadeIn 0.3s ease;
    }

    .step.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--text);
    }

    .form-group label .required {
      color: #ef4444;
      margin-left: 2px;
    }

    .form-group input[type="text"],
    .form-group textarea,
    .form-group select {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid #e0e0e0;
      border-radius: calc(var(--radius) * 0.6);
      font-family: var(--font);
      font-size: 14px;
      color: var(--text);
      background: #fafafa;
      transition: border-color 0.2s, box-shadow 0.2s;
      outline: none;
    }

    .form-group input[type="text"]:focus,
    .form-group textarea:focus,
    .form-group select:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
      background: #fff;
    }

    .form-group textarea {
      min-height: 120px;
      resize: vertical;
    }

    .form-group .field-hint {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
    }

    .form-group .field-error {
      font-size: 12px;
      color: #ef4444;
      margin-top: 4px;
      display: none;
    }

    .form-group .field-error.visible {
      display: block;
    }

    .textarea-wrapper {
      position: relative;
    }

    .textarea-actions {
      position: absolute;
      bottom: 10px;
      right: 10px;
      display: flex;
      gap: 6px;
    }

    .icon-btn {
      width: 34px;
      height: 34px;
      border: 1.5px solid #e0e0e0;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      color: #777;
    }

    .icon-btn:hover {
      border-color: var(--primary);
      color: var(--primary);
      background: color-mix(in srgb, var(--primary) 5%, white);
    }

    .icon-btn svg {
      width: 16px;
      height: 16px;
    }

    .icon-btn.recording {
      border-color: #ef4444;
      background: #fef2f2;
      color: #ef4444;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
      50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    }

    .recording-label {
      position: absolute;
      bottom: 48px;
      right: 10px;
      font-size: 11px;
      color: #ef4444;
      font-weight: 500;
      background: #fef2f2;
      padding: 2px 8px;
      border-radius: 10px;
      display: none;
    }

    .recording-label.visible {
      display: block;
    }

    .dropzone {
      border: 2px dashed #d0d0d0;
      border-radius: calc(var(--radius) * 0.6);
      padding: 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: #fafafa;
    }

    .dropzone:hover,
    .dropzone.dragover {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 5%, white);
    }

    .dropzone-icon {
      color: #bbb;
      margin-bottom: 8px;
    }

    .dropzone-icon svg {
      width: 32px;
      height: 32px;
    }

    .dropzone-text {
      font-size: 13px;
      color: #888;
    }

    .dropzone-hint {
      font-size: 11px;
      color: #aaa;
      margin-top: 4px;
    }

    .file-list {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .file-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #f7f7f7;
      border-radius: calc(var(--radius) * 0.4);
      font-size: 13px;
      border: 1px solid #eee;
    }

    .file-item-info {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }

    .file-item-icon {
      color: var(--primary);
      flex-shrink: 0;
    }

    .file-item-icon svg {
      width: 16px;
      height: 16px;
    }

    .file-item-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text);
    }

    .file-item-size {
      color: #999;
      flex-shrink: 0;
      margin-left: 8px;
      font-size: 12px;
    }

    .file-item-remove {
      background: none;
      border: none;
      cursor: pointer;
      color: #ccc;
      padding: 2px;
      margin-left: 8px;
      flex-shrink: 0;
      transition: color 0.2s;
    }

    .file-item-remove:hover {
      color: #ef4444;
    }

    .file-item-remove svg {
      width: 14px;
      height: 14px;
    }

    .btn-primary {
      width: 100%;
      padding: 12px 20px;
      background: var(--primary);
      color: #ffffff;
      border: none;
      border-radius: calc(var(--radius) * 0.6);
      font-family: var(--font);
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary:hover {
      filter: brightness(1.08);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 30%, transparent);
    }

    .btn-primary:active {
      filter: brightness(0.95);
      transform: translateY(1px);
    }

    .btn-primary:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      filter: none;
      box-shadow: none;
      transform: none;
    }

    .global-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 10px 14px;
      border-radius: calc(var(--radius) * 0.4);
      font-size: 13px;
      margin-bottom: 16px;
      display: none;
    }

    .global-error.visible {
      display: block;
    }

    /* Step 2: Screening */
    .screening-content {
      text-align: center;
      padding: 40px 20px;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #eee;
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .screening-content h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .screening-content p {
      font-size: 14px;
      color: #888;
    }

    /* Step 3: Questions */
    .questions-header {
      margin-bottom: 24px;
    }

    .questions-header h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .questions-header p {
      font-size: 13px;
      color: #888;
    }

    .question-group {
      margin-bottom: 20px;
    }

    .question-group label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 6px;
    }

    .question-group label .required {
      color: #ef4444;
      margin-left: 2px;
    }

    .question-group select,
    .question-group input[type="text"] {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid #e0e0e0;
      border-radius: calc(var(--radius) * 0.6);
      font-family: var(--font);
      font-size: 14px;
      color: var(--text);
      background: #fafafa;
      transition: border-color 0.2s, box-shadow 0.2s;
      outline: none;
    }

    .question-group select:focus,
    .question-group input[type="text"]:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
      background: #fff;
    }

    .checkbox-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 14px;
    }

    .checkbox-item input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--primary);
      cursor: pointer;
    }

    .toggle-group {
      display: flex;
      gap: 10px;
    }

    .toggle-btn {
      flex: 1;
      padding: 10px 16px;
      border: 1.5px solid #e0e0e0;
      border-radius: calc(var(--radius) * 0.6);
      background: #fafafa;
      font-family: var(--font);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
      color: var(--text);
    }

    .toggle-btn:hover {
      border-color: var(--primary);
    }

    .toggle-btn.selected {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 10%, white);
      color: var(--primary);
    }

    /* Step 4: Result */
    .result-content {
      text-align: center;
      padding: 40px 20px;
    }

    .result-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
    }

    .result-icon.success {
      background: #ecfdf5;
      color: #10b981;
    }

    .result-icon.rejected {
      background: #fef2f2;
      color: #ef4444;
    }

    .result-icon svg {
      width: 28px;
      height: 28px;
    }

    .result-content h2 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .result-content p {
      font-size: 14px;
      color: #888;
      margin-bottom: 4px;
    }

    .result-content .ref-id {
      display: inline-block;
      margin-top: 12px;
      padding: 6px 14px;
      background: #f0f0f0;
      border-radius: calc(var(--radius) * 0.4);
      font-size: 13px;
      color: #666;
      font-family: monospace;
    }

    .result-content .rejection-reason {
      margin-top: 12px;
      padding: 12px 16px;
      background: #fef2f2;
      border-radius: calc(var(--radius) * 0.4);
      font-size: 13px;
      color: #991b1b;
      text-align: left;
    }

    /* Submissions History */
    .history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .history-header h2 {
      font-size: 16px;
      font-weight: 600;
    }

    .btn-new-submission {
      padding: 7px 14px;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: calc(var(--radius) * 0.4);
      font-family: var(--font);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: filter 0.2s;
    }

    .btn-new-submission:hover {
      filter: brightness(1.1);
    }

    .submission-card {
      border: 1.5px solid #eee;
      border-radius: calc(var(--radius) * 0.5);
      padding: 14px 16px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    }

    .submission-card:hover {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 3%, white);
    }

    .submission-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .submission-card-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .submission-card-status {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .status-pending, .status-screening {
      background: #fef3c7;
      color: #92400e;
    }

    .status-needs_input {
      background: #dbeafe;
      color: #1e40af;
    }

    .status-approved, .status-scored {
      background: #d1fae5;
      color: #065f46;
    }

    .status-rejected {
      background: #fee2e2;
      color: #991b1b;
    }

    .submission-card-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 6px;
      font-size: 12px;
      color: #999;
    }

    .submission-card-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .submission-card-dot.pulsing {
      animation: pulse-dot 1.5s ease-in-out infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .submissions-empty {
      text-align: center;
      padding: 24px 16px;
      color: #999;
      font-size: 13px;
    }

    .submission-card .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
    }

    .footer {
      padding: 14px 28px;
      text-align: center;
      border-top: 1px solid #f0f0f0;
      font-size: 12px;
      color: #bbb;
    }

    .footer a {
      color: #999;
      text-decoration: none;
    }

    .footer a:hover {
      color: var(--primary);
    }

    /* Responsive */
    @media (max-width: 480px) {
      body {
        padding: 10px;
      }
      .container {
        border-radius: calc(var(--radius) * 0.7);
      }
      .header {
        padding: 18px 20px 14px;
      }
      .step {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${e.logoUrl ? `<img class="header-logo" src="${e.logoUrl}" alt="">` : ""}
      <div class="header-text">
        <h1>${e.title}</h1>
        ${e.welcomeMessage ? `<p>${e.welcomeMessage}</p>` : ""}
      </div>
    </div>

    <!-- Loading -->
    <div class="step active" id="step-loading">
      <div class="screening-content">
        <div class="spinner"></div>
      </div>
    </div>

    <!-- Step 0: Submissions History -->
    <div class="step" id="step-history">
      <div class="history-header">
        <h2 id="history-title">Your Submissions</h2>
        <button class="btn-new-submission" id="btn-new-submission">+ New</button>
      </div>
      <div id="submissions-list"></div>
    </div>

    <!-- Step 1: Submit Form -->
    <div class="step" id="step-submit">
      <div class="global-error" id="global-error"></div>

      <div class="form-group">
        <label id="label-title"></label>
        <input type="text" id="input-title" maxlength="200" autocomplete="off">
        <div class="field-error" id="error-title"></div>
      </div>

      <div class="form-group">
        <label id="label-desc"></label>
        <div class="textarea-wrapper">
          <textarea id="input-desc" maxlength="10000"></textarea>
          <span class="recording-label" id="recording-label"></span>
          <div class="textarea-actions">
            <button type="button" class="icon-btn" id="btn-mic" title="Voice input" style="display:none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <button type="button" class="icon-btn" id="btn-attach" title="Attach file">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="field-error" id="error-desc"></div>
      </div>

      <div class="form-group">
        <div class="dropzone" id="dropzone">
          <div class="dropzone-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="dropzone-text" id="dropzone-text"></div>
          <div class="dropzone-hint" id="dropzone-hint"></div>
        </div>
        <input type="file" id="file-input" multiple hidden>
        <div class="file-list" id="file-list"></div>
        <div class="field-error" id="error-files"></div>
      </div>

      <button class="btn-primary" id="btn-submit"></button>
    </div>

    <!-- Step 2: Screening -->
    <div class="step" id="step-screening">
      <div class="screening-content">
        <div class="spinner"></div>
        <h2 id="screening-title"></h2>
        <p id="screening-desc"></p>
      </div>
    </div>

    <!-- Step 3: Questions -->
    <div class="step" id="step-questions">
      <div class="questions-header">
        <h2 id="questions-title"></h2>
      </div>
      <div id="questions-container"></div>
      <div class="global-error" id="questions-error"></div>
      <button class="btn-primary" id="btn-answers" style="margin-top: 8px;"></button>
    </div>

    <!-- Step 4: Result -->
    <div class="step" id="step-result">
      <div class="result-content" id="result-content"></div>
    </div>

    <div class="footer" id="footer"></div>
  </div>

  <script>
    (function() {
      'use strict';

      var CONFIG = {
        projectId: '${e.projectId}',
        maxFileSize: ${e.maxFileSize},
        maxTotalSize: ${e.maxTotalSize},
        allowedFileTypes: ${JSON.stringify(e.allowedFileTypes)},
        language: '${e.language}'
      };

      var T = {
        en: { title: "Submit a Requirement", titleLabel: "Title", titlePlaceholder: "Brief title for your requirement", descLabel: "Description", descPlaceholder: "Describe what you want to build in detail...", submit: "Submit", submitting: "Submitting...", analyzing: "Analyzing your request...", analyzingDesc: "Our AI is reviewing your submission", questions: "We need a bit more info", submitAnswers: "Submit Answers", success: "Submitted Successfully!", successDesc: "Your requirement has been received and is being reviewed.", rejected: "Submission Not Accepted", rejectedDesc: "Unfortunately, your submission could not be processed.", refId: "Reference", dragDrop: "Drag & drop files here or click to browse", maxFiles: "Max {size}MB per file, {total}MB total", recording: "Listening...", stopRecording: "Stop", voiceUnsupported: "Voice input not supported", fileTooBig: "File exceeds size limit", fileTypeNotAllowed: "File type not allowed", totalTooBig: "Total file size exceeds limit", titleTooShort: "Title must be at least 5 characters", descTooShort: "Description must be at least 20 characters", invalidContent: "Please enter meaningful content", poweredBy: "Powered by AutoSoftware", required: "Required" },
        es: { title: "Enviar un Requisito", titleLabel: "Titulo", titlePlaceholder: "Titulo breve para su requisito", descLabel: "Descripcion", descPlaceholder: "Describa lo que desea construir en detalle...", submit: "Enviar", submitting: "Enviando...", analyzing: "Analizando su solicitud...", analyzingDesc: "Nuestra IA esta revisando su envio", questions: "Necesitamos un poco mas de informacion", submitAnswers: "Enviar Respuestas", success: "Enviado Exitosamente!", successDesc: "Su requisito ha sido recibido y esta siendo revisado.", rejected: "Envio No Aceptado", rejectedDesc: "Lamentablemente, su envio no pudo ser procesado.", refId: "Referencia", dragDrop: "Arrastre archivos aqui o haga clic para buscar", maxFiles: "Max {size}MB por archivo, {total}MB total", recording: "Escuchando...", stopRecording: "Detener", voiceUnsupported: "Entrada de voz no soportada", fileTooBig: "El archivo excede el limite", fileTypeNotAllowed: "Tipo de archivo no permitido", totalTooBig: "El tamano total excede el limite", titleTooShort: "El titulo debe tener al menos 5 caracteres", descTooShort: "La descripcion debe tener al menos 20 caracteres", invalidContent: "Por favor ingrese contenido significativo", poweredBy: "Desarrollado por AutoSoftware", required: "Requerido" },
        fr: { title: "Soumettre une Exigence", titleLabel: "Titre", titlePlaceholder: "Titre bref pour votre exigence", descLabel: "Description", descPlaceholder: "Decrivez ce que vous souhaitez construire en detail...", submit: "Soumettre", submitting: "Envoi en cours...", analyzing: "Analyse de votre demande...", analyzingDesc: "Notre IA examine votre soumission", questions: "Nous avons besoin de plus d'informations", submitAnswers: "Envoyer les Reponses", success: "Soumis avec Succes!", successDesc: "Votre exigence a ete recue et est en cours d'examen.", rejected: "Soumission Non Acceptee", rejectedDesc: "Malheureusement, votre soumission n'a pas pu etre traitee.", refId: "Reference", dragDrop: "Glissez-deposez des fichiers ici ou cliquez pour parcourir", maxFiles: "Max {size}Mo par fichier, {total}Mo total", recording: "Ecoute...", stopRecording: "Arreter", voiceUnsupported: "Saisie vocale non supportee", fileTooBig: "Le fichier depasse la limite", fileTypeNotAllowed: "Type de fichier non autorise", totalTooBig: "La taille totale depasse la limite", titleTooShort: "Le titre doit contenir au moins 5 caracteres", descTooShort: "La description doit contenir au moins 20 caracteres", invalidContent: "Veuillez saisir un contenu significatif", poweredBy: "Propulse par AutoSoftware", required: "Requis" },
        de: { title: "Anforderung einreichen", titleLabel: "Titel", titlePlaceholder: "Kurzer Titel fur Ihre Anforderung", descLabel: "Beschreibung", descPlaceholder: "Beschreiben Sie detailliert, was Sie erstellen mochten...", submit: "Einreichen", submitting: "Wird eingereicht...", analyzing: "Ihre Anfrage wird analysiert...", analyzingDesc: "Unsere KI uberpruft Ihre Einreichung", questions: "Wir benotigen weitere Informationen", submitAnswers: "Antworten senden", success: "Erfolgreich eingereicht!", successDesc: "Ihre Anforderung wurde erhalten und wird uberpruft.", rejected: "Einreichung nicht akzeptiert", rejectedDesc: "Leider konnte Ihre Einreichung nicht verarbeitet werden.", refId: "Referenz", dragDrop: "Dateien hierher ziehen oder klicken zum Durchsuchen", maxFiles: "Max {size}MB pro Datei, {total}MB gesamt", recording: "Hort zu...", stopRecording: "Stopp", voiceUnsupported: "Spracheingabe nicht unterstutzt", fileTooBig: "Datei uberschreitet das Limit", fileTypeNotAllowed: "Dateityp nicht erlaubt", totalTooBig: "Gesamtgrosse uberschreitet das Limit", titleTooShort: "Titel muss mindestens 5 Zeichen haben", descTooShort: "Beschreibung muss mindestens 20 Zeichen haben", invalidContent: "Bitte geben Sie sinnvollen Inhalt ein", poweredBy: "Betrieben von AutoSoftware", required: "Erforderlich" },
        pt: { title: "Enviar um Requisito", titleLabel: "Titulo", titlePlaceholder: "Titulo breve para seu requisito", descLabel: "Descricao", descPlaceholder: "Descreva em detalhes o que voce deseja construir...", submit: "Enviar", submitting: "Enviando...", analyzing: "Analisando sua solicitacao...", analyzingDesc: "Nossa IA esta revisando sua submissao", questions: "Precisamos de mais informacoes", submitAnswers: "Enviar Respostas", success: "Enviado com Sucesso!", successDesc: "Seu requisito foi recebido e esta sendo revisado.", rejected: "Submissao Nao Aceita", rejectedDesc: "Infelizmente, sua submissao nao pode ser processada.", refId: "Referencia", dragDrop: "Arraste arquivos aqui ou clique para procurar", maxFiles: "Max {size}MB por arquivo, {total}MB total", recording: "Ouvindo...", stopRecording: "Parar", voiceUnsupported: "Entrada de voz nao suportada", fileTooBig: "Arquivo excede o limite", fileTypeNotAllowed: "Tipo de arquivo nao permitido", totalTooBig: "Tamanho total excede o limite", titleTooShort: "O titulo deve ter pelo menos 5 caracteres", descTooShort: "A descricao deve ter pelo menos 20 caracteres", invalidContent: "Por favor insira conteudo significativo", poweredBy: "Desenvolvido por AutoSoftware", required: "Obrigatorio" },
        zh: { title: "\\u63d0\\u4ea4\\u9700\\u6c42", titleLabel: "\\u6807\\u9898", titlePlaceholder: "\\u4e3a\\u60a8\\u7684\\u9700\\u6c42\\u5199\\u4e00\\u4e2a\\u7b80\\u77ed\\u7684\\u6807\\u9898", descLabel: "\\u63cf\\u8ff0", descPlaceholder: "\\u8be6\\u7ec6\\u63cf\\u8ff0\\u60a8\\u60f3\\u8981\\u6784\\u5efa\\u7684\\u5185\\u5bb9...", submit: "\\u63d0\\u4ea4", submitting: "\\u63d0\\u4ea4\\u4e2d...", analyzing: "\\u6b63\\u5728\\u5206\\u6790\\u60a8\\u7684\\u8bf7\\u6c42...", analyzingDesc: "\\u6211\\u4eec\\u7684AI\\u6b63\\u5728\\u5ba1\\u6838\\u60a8\\u7684\\u63d0\\u4ea4", questions: "\\u6211\\u4eec\\u9700\\u8981\\u66f4\\u591a\\u4fe1\\u606f", submitAnswers: "\\u63d0\\u4ea4\\u7b54\\u6848", success: "\\u63d0\\u4ea4\\u6210\\u529f!", successDesc: "\\u60a8\\u7684\\u9700\\u6c42\\u5df2\\u6536\\u5230\\uff0c\\u6b63\\u5728\\u5ba1\\u6838\\u4e2d\\u3002", rejected: "\\u63d0\\u4ea4\\u672a\\u88ab\\u63a5\\u53d7", rejectedDesc: "\\u5f88\\u62b1\\u6b49\\uff0c\\u60a8\\u7684\\u63d0\\u4ea4\\u65e0\\u6cd5\\u5904\\u7406\\u3002", refId: "\\u53c2\\u8003\\u53f7", dragDrop: "\\u62d6\\u653e\\u6587\\u4ef6\\u5230\\u8fd9\\u91cc\\u6216\\u70b9\\u51fb\\u6d4f\\u89c8", maxFiles: "\\u6bcf\\u4e2a\\u6587\\u4ef6\\u6700\\u5927{size}MB\\uff0c\\u603b\\u5171{total}MB", recording: "\\u6b63\\u5728\\u542c...", stopRecording: "\\u505c\\u6b62", voiceUnsupported: "\\u4e0d\\u652f\\u6301\\u8bed\\u97f3\\u8f93\\u5165", fileTooBig: "\\u6587\\u4ef6\\u8d85\\u8fc7\\u5927\\u5c0f\\u9650\\u5236", fileTypeNotAllowed: "\\u4e0d\\u5141\\u8bb8\\u7684\\u6587\\u4ef6\\u7c7b\\u578b", totalTooBig: "\\u603b\\u6587\\u4ef6\\u5927\\u5c0f\\u8d85\\u8fc7\\u9650\\u5236", titleTooShort: "\\u6807\\u9898\\u81f3\\u5c11\\u9700\\u89815\\u4e2a\\u5b57\\u7b26", descTooShort: "\\u63cf\\u8ff0\\u81f3\\u5c11\\u9700\\u898120\\u4e2a\\u5b57\\u7b26", invalidContent: "\\u8bf7\\u8f93\\u5165\\u6709\\u610f\\u4e49\\u7684\\u5185\\u5bb9", poweredBy: "\\u7531 AutoSoftware \\u63d0\\u4f9b\\u652f\\u6301", required: "\\u5fc5\\u586b" }
      };

      var lang = T[CONFIG.language] || T.en;

      // DOM references
      var $ = function(id) { return document.getElementById(id); };

      var steps = {
        loading: $('step-loading'),
        history: $('step-history'),
        submit: $('step-submit'),
        screening: $('step-screening'),
        questions: $('step-questions'),
        result: $('step-result')
      };

      // State
      var attachedFiles = [];
      var submissionId = null;
      var pollTimer = null;
      var isRecording = false;
      var recognition = null;
      var inputMethod = 'text';
      var allSubmissions = [];

      // --- Initialize UI text ---
      $('label-title').innerHTML = lang.titleLabel + '<span class="required">*</span>';
      $('input-title').placeholder = lang.titlePlaceholder;
      $('label-desc').innerHTML = lang.descLabel + '<span class="required">*</span>';
      $('input-desc').placeholder = lang.descPlaceholder;
      $('btn-submit').textContent = lang.submit;
      $('screening-title').textContent = lang.analyzing;
      $('screening-desc').textContent = lang.analyzingDesc;
      $('questions-title').textContent = lang.questions;
      $('btn-answers').textContent = lang.submitAnswers;
      $('dropzone-text').textContent = lang.dragDrop;
      $('dropzone-hint').textContent = lang.maxFiles
        .replace('{size}', CONFIG.maxFileSize)
        .replace('{total}', CONFIG.maxTotalSize);
      $('footer').innerHTML = '<a href="https://autosoftware.app" target="_blank" rel="noopener">' + lang.poweredBy + '</a>';

      // --- Utility functions ---
      function showStep(name) {
        Object.keys(steps).forEach(function(k) {
          steps[k].classList.toggle('active', k === name);
        });
      }

      function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      function showError(el, msg) {
        el.textContent = msg;
        el.classList.add('visible');
      }

      function hideError(el) {
        el.textContent = '';
        el.classList.remove('visible');
      }

      function showGlobalError(msg) {
        var el = $('global-error');
        el.textContent = msg;
        el.classList.add('visible');
      }

      function hideGlobalError() {
        var el = $('global-error');
        el.textContent = '';
        el.classList.remove('visible');
      }

      function hasEntropy(str) {
        var s = str.trim();
        if (s.length === 0) return false;
        // Reject all-same-character
        if (/^(.)\\1*$/.test(s)) return false;
        // Reject purely numeric
        if (/^\\d+$/.test(s)) return false;
        return true;
      }

      function escapeHtmlClient(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
      }

      // --- File handling ---
      function getTotalFileSize() {
        var total = 0;
        attachedFiles.forEach(function(f) { total += f.file.size; });
        return total;
      }

      function addFiles(fileList) {
        hideError($('error-files'));
        for (var i = 0; i < fileList.length; i++) {
          var file = fileList[i];
          var ext = file.name.split('.').pop().toLowerCase();

          if (CONFIG.allowedFileTypes.length > 0 && CONFIG.allowedFileTypes.indexOf(ext) === -1) {
            showError($('error-files'), lang.fileTypeNotAllowed + ': .' + ext);
            continue;
          }

          if (file.size > CONFIG.maxFileSize * 1024 * 1024) {
            showError($('error-files'), lang.fileTooBig + ' (' + file.name + ')');
            continue;
          }

          if (getTotalFileSize() + file.size > CONFIG.maxTotalSize * 1024 * 1024) {
            showError($('error-files'), lang.totalTooBig);
            continue;
          }

          attachedFiles.push({ file: file, id: Date.now() + '-' + Math.random().toString(36).substr(2, 9) });
        }
        renderFileList();
      }

      function removeFile(id) {
        attachedFiles = attachedFiles.filter(function(f) { return f.id !== id; });
        hideError($('error-files'));
        renderFileList();
      }

      function renderFileList() {
        var container = $('file-list');
        container.innerHTML = '';
        attachedFiles.forEach(function(item) {
          var div = document.createElement('div');
          div.className = 'file-item';
          div.innerHTML =
            '<div class="file-item-info">' +
              '<span class="file-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>' +
              '<span class="file-item-name">' + escapeHtmlClient(item.file.name) + '</span>' +
              '<span class="file-item-size">' + formatFileSize(item.file.size) + '</span>' +
            '</div>' +
            '<button type="button" class="file-item-remove" data-id="' + item.id + '" title="Remove">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>';
          container.appendChild(div);
        });

        // Bind remove buttons
        var removeBtns = container.querySelectorAll('.file-item-remove');
        removeBtns.forEach(function(btn) {
          btn.addEventListener('click', function() {
            removeFile(btn.getAttribute('data-id'));
          });
        });
      }

      function readFileAsBase64(file) {
        return new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onload = function() {
            var result = reader.result;
            var base64 = result.split(',')[1] || '';
            resolve(base64);
          };
          reader.onerror = function() { reject(reader.error); };
          reader.readAsDataURL(file);
        });
      }

      // --- Drag & Drop ---
      var dropzone = $('dropzone');
      var fileInput = $('file-input');

      dropzone.addEventListener('click', function() { fileInput.click(); });
      fileInput.addEventListener('change', function() {
        if (fileInput.files.length > 0) {
          addFiles(fileInput.files);
          fileInput.value = '';
        }
      });

      $('btn-attach').addEventListener('click', function() { fileInput.click(); });

      dropzone.addEventListener('dragover', function(ev) {
        ev.preventDefault();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', function(ev) {
        ev.preventDefault();
        dropzone.classList.remove('dragover');
      });
      dropzone.addEventListener('drop', function(ev) {
        ev.preventDefault();
        dropzone.classList.remove('dragover');
        if (ev.dataTransfer.files.length > 0) {
          addFiles(ev.dataTransfer.files);
        }
      });

      // --- Voice Input ---
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        $('btn-mic').style.display = 'flex';
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = CONFIG.language === 'zh' ? 'zh-CN' : CONFIG.language;

        recognition.onresult = function(event) {
          var transcript = '';
          for (var i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              transcript += event.results[i][0].transcript;
            }
          }
          if (transcript) {
            var desc = $('input-desc');
            desc.value = desc.value + (desc.value ? ' ' : '') + transcript;
            inputMethod = 'voice';
          }
        };

        recognition.onend = function() {
          if (isRecording) {
            stopRecording();
          }
        };

        recognition.onerror = function() {
          stopRecording();
        };
      }

      function startRecording() {
        if (!recognition) return;
        isRecording = true;
        recognition.start();
        $('btn-mic').classList.add('recording');
        $('recording-label').textContent = lang.recording;
        $('recording-label').classList.add('visible');
      }

      function stopRecording() {
        isRecording = false;
        if (recognition) {
          try { recognition.stop(); } catch(e) {}
        }
        $('btn-mic').classList.remove('recording');
        $('recording-label').classList.remove('visible');
      }

      $('btn-mic').addEventListener('click', function() {
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      });

      // --- Form Validation & Submission ---
      function validateForm() {
        var valid = true;
        var title = $('input-title').value.trim();
        var desc = $('input-desc').value.trim();

        hideError($('error-title'));
        hideError($('error-desc'));

        if (title.length < 5) {
          showError($('error-title'), lang.titleTooShort);
          valid = false;
        } else if (!hasEntropy(title)) {
          showError($('error-title'), lang.invalidContent);
          valid = false;
        }

        if (desc.length < 20) {
          showError($('error-desc'), lang.descTooShort);
          valid = false;
        } else if (!hasEntropy(desc)) {
          showError($('error-desc'), lang.invalidContent);
          valid = false;
        }

        return valid;
      }

      $('btn-submit').addEventListener('click', async function() {
        hideGlobalError();
        if (!validateForm()) return;

        var btn = $('btn-submit');
        btn.disabled = true;
        btn.textContent = lang.submitting;

        try {
          // Convert files to base64
          var attachments = [];
          for (var i = 0; i < attachedFiles.length; i++) {
            var f = attachedFiles[i];
            var base64 = await readFileAsBase64(f.file);
            attachments.push({
              filename: f.file.name,
              mimeType: f.file.type || 'application/octet-stream',
              size: f.file.size,
              data: base64
            });
          }

          var body = {
            title: $('input-title').value.trim(),
            description: $('input-desc').value.trim(),
            inputMethod: inputMethod,
            attachments: attachments
          };

          var resp = await fetch('/embed/' + CONFIG.projectId + '/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body)
          });

          var data = await resp.json();

          if (!resp.ok) {
            var errMsg = (data.error && data.error.message) ? data.error.message : 'Submission failed';
            showGlobalError(errMsg);
            btn.disabled = false;
            btn.textContent = lang.submit;
            return;
          }

          submissionId = data.data.id;
          saveActiveSubmission(submissionId);
          showStep('screening');
          startPolling();
        } catch (err) {
          showGlobalError(err.message || 'Network error');
          btn.disabled = false;
          btn.textContent = lang.submit;
        }
      });

      // --- Polling ---
      function startPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(pollStatus, 3000);
        pollStatus();
      }

      function stopPolling() {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }

      async function pollStatus() {
        try {
          var resp = await fetch('/embed/' + CONFIG.projectId + '/submission/' + submissionId, {
            credentials: 'include'
          });
          if (!resp.ok) return;
          var data = await resp.json();
          var sub = data.data;

          switch (sub.screeningStatus) {
            case 'pending':
            case 'screening':
              // Keep polling, stay on step 2
              break;
            case 'needs_input':
              stopPolling();
              renderQuestions(sub.questions || []);
              showStep('questions');
              break;
            case 'approved':
            case 'scored':
              stopPolling();
              renderSuccess(sub);
              showStep('result');
              break;
            case 'rejected':
              stopPolling();
              renderRejection(sub);
              showStep('result');
              break;
          }
        } catch (err) {
          // Silently retry on next poll
        }
      }

      // --- Question Rendering ---
      function renderQuestions(questions) {
        var container = $('questions-container');
        container.innerHTML = '';

        questions.forEach(function(q) {
          var group = document.createElement('div');
          group.className = 'question-group';

          var labelHtml = escapeHtmlClient(q.label);
          if (q.required) {
            labelHtml += '<span class="required">*</span>';
          }
          var label = document.createElement('label');
          label.innerHTML = labelHtml;
          group.appendChild(label);

          switch (q.type) {
            case 'select':
              var select = document.createElement('select');
              select.setAttribute('data-key', q.questionKey);
              select.setAttribute('data-type', 'select');
              if (q.required) select.setAttribute('data-required', 'true');
              var defaultOpt = document.createElement('option');
              defaultOpt.value = '';
              defaultOpt.textContent = '—';
              select.appendChild(defaultOpt);
              (q.options || []).forEach(function(opt) {
                var o = document.createElement('option');
                o.value = opt;
                o.textContent = opt;
                select.appendChild(o);
              });
              group.appendChild(select);
              break;

            case 'multi_select':
              var checkboxDiv = document.createElement('div');
              checkboxDiv.className = 'checkbox-group';
              checkboxDiv.setAttribute('data-key', q.questionKey);
              checkboxDiv.setAttribute('data-type', 'multi_select');
              if (q.required) checkboxDiv.setAttribute('data-required', 'true');
              (q.options || []).forEach(function(opt) {
                var itemLabel = document.createElement('label');
                itemLabel.className = 'checkbox-item';
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = opt;
                itemLabel.appendChild(cb);
                itemLabel.appendChild(document.createTextNode(opt));
                checkboxDiv.appendChild(itemLabel);
              });
              group.appendChild(checkboxDiv);
              break;

            case 'confirm':
              var toggleDiv = document.createElement('div');
              toggleDiv.className = 'toggle-group';
              toggleDiv.setAttribute('data-key', q.questionKey);
              toggleDiv.setAttribute('data-type', 'confirm');
              if (q.required) toggleDiv.setAttribute('data-required', 'true');

              var yesBtn = document.createElement('button');
              yesBtn.type = 'button';
              yesBtn.className = 'toggle-btn';
              yesBtn.textContent = CONFIG.language === 'de' ? 'Ja' : CONFIG.language === 'fr' ? 'Oui' : CONFIG.language === 'es' || CONFIG.language === 'pt' ? 'Si' : CONFIG.language === 'zh' ? '\\u662f' : 'Yes';
              yesBtn.setAttribute('data-value', 'true');

              var noBtn = document.createElement('button');
              noBtn.type = 'button';
              noBtn.className = 'toggle-btn';
              noBtn.textContent = CONFIG.language === 'de' ? 'Nein' : CONFIG.language === 'fr' ? 'Non' : CONFIG.language === 'es' || CONFIG.language === 'pt' ? 'No' : CONFIG.language === 'zh' ? '\\u5426' : 'No';
              noBtn.setAttribute('data-value', 'false');

              yesBtn.addEventListener('click', function() {
                yesBtn.classList.add('selected');
                noBtn.classList.remove('selected');
              });
              noBtn.addEventListener('click', function() {
                noBtn.classList.add('selected');
                yesBtn.classList.remove('selected');
              });

              toggleDiv.appendChild(yesBtn);
              toggleDiv.appendChild(noBtn);
              group.appendChild(toggleDiv);
              break;

            case 'text':
            default:
              var input = document.createElement('input');
              input.type = 'text';
              input.setAttribute('data-key', q.questionKey);
              input.setAttribute('data-type', 'text');
              if (q.required) input.setAttribute('data-required', 'true');
              group.appendChild(input);
              break;
          }

          container.appendChild(group);
        });
      }

      function collectAnswers() {
        var answers = {};
        var container = $('questions-container');

        // select
        container.querySelectorAll('select[data-key]').forEach(function(el) {
          answers[el.getAttribute('data-key')] = el.value;
        });

        // text
        container.querySelectorAll('input[type="text"][data-key]').forEach(function(el) {
          answers[el.getAttribute('data-key')] = el.value.trim();
        });

        // multi_select
        container.querySelectorAll('.checkbox-group[data-key]').forEach(function(el) {
          var selected = [];
          el.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) {
            selected.push(cb.value);
          });
          answers[el.getAttribute('data-key')] = selected;
        });

        // confirm
        container.querySelectorAll('.toggle-group[data-key]').forEach(function(el) {
          var selectedBtn = el.querySelector('.toggle-btn.selected');
          if (selectedBtn) {
            answers[el.getAttribute('data-key')] = selectedBtn.getAttribute('data-value') === 'true';
          } else {
            answers[el.getAttribute('data-key')] = null;
          }
        });

        return answers;
      }

      function validateAnswers() {
        var container = $('questions-container');
        var valid = true;
        var requiredFields = container.querySelectorAll('[data-required="true"]');

        requiredFields.forEach(function(el) {
          var key = el.getAttribute('data-key');
          var type = el.getAttribute('data-type');
          var value;

          if (type === 'select') {
            value = el.value;
            if (!value) valid = false;
          } else if (type === 'text') {
            value = el.value.trim();
            if (!value) valid = false;
          } else if (type === 'multi_select') {
            var checked = el.querySelectorAll('input[type="checkbox"]:checked');
            if (checked.length === 0) valid = false;
          } else if (type === 'confirm') {
            var selected = el.querySelector('.toggle-btn.selected');
            if (!selected) valid = false;
          }
        });

        return valid;
      }

      $('btn-answers').addEventListener('click', async function() {
        var errEl = $('questions-error');
        hideError(errEl);
        errEl.classList.remove('visible');

        if (!validateAnswers()) {
          errEl.textContent = lang.required;
          errEl.classList.add('visible');
          errEl.style.display = 'block';
          return;
        }

        var btn = $('btn-answers');
        btn.disabled = true;

        var answers = collectAnswers();

        try {
          var resp = await fetch('/embed/' + CONFIG.projectId + '/submission/' + submissionId + '/answers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ answers: answers })
          });

          if (!resp.ok) {
            var data = await resp.json();
            errEl.textContent = (data.error && data.error.message) || 'Failed to submit answers';
            errEl.classList.add('visible');
            errEl.style.display = 'block';
            btn.disabled = false;
            return;
          }

          btn.disabled = false;
          showStep('screening');
          startPolling();
        } catch (err) {
          errEl.textContent = err.message || 'Network error';
          errEl.classList.add('visible');
          errEl.style.display = 'block';
          btn.disabled = false;
        }
      });

      // --- Result rendering ---
      function renderSuccess(sub) {
        var c = $('result-content');
        c.innerHTML =
          '<div class="result-icon success">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</div>' +
          '<h2>' + escapeHtmlClient(lang.success) + '</h2>' +
          '<p>' + escapeHtmlClient(lang.successDesc) + '</p>' +
          '<div class="ref-id">' + escapeHtmlClient(lang.refId) + ': ' + escapeHtmlClient(sub.id.substring(0, 8).toUpperCase()) + '</div>' +
          '<button class="btn-primary" style="margin-top:20px;width:auto;padding:10px 24px;display:inline-block;" onclick="window.__backToHistory()">Back to Submissions</button>';
      }

      function renderRejection(sub) {
        var c = $('result-content');
        var reason = sub.screeningReason || '';
        c.innerHTML =
          '<div class="result-icon rejected">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</div>' +
          '<h2>' + escapeHtmlClient(lang.rejected) + '</h2>' +
          '<p>' + escapeHtmlClient(lang.rejectedDesc) + '</p>' +
          (reason ? '<div class="rejection-reason">' + escapeHtmlClient(reason) + '</div>' : '') +
          '<button class="btn-primary" style="margin-top:20px;width:auto;padding:10px 24px;display:inline-block;" onclick="window.__backToHistory()">Back to Submissions</button>';
      }

      // --- Submissions History ---
      var STATUS_LABELS = {
        pending: 'Pending',
        screening: 'Screening',
        needs_input: 'Needs Input',
        approved: 'Approved',
        scored: 'Approved',
        rejected: 'Rejected'
      };

      function formatDate(dateStr) {
        var d = new Date(dateStr);
        var now = new Date();
        var diffMs = now - d;
        var diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return diffMin + 'm ago';
        var diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return diffHr + 'h ago';
        var diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7) return diffDay + 'd ago';
        return d.toLocaleDateString();
      }

      function isActiveStatus(status) {
        return status === 'pending' || status === 'screening' || status === 'needs_input';
      }

      function renderSubmissionsList(submissions) {
        allSubmissions = submissions;
        var container = $('submissions-list');
        container.innerHTML = '';

        if (submissions.length === 0) {
          container.innerHTML = '<div class="submissions-empty">No submissions yet</div>';
          return;
        }

        submissions.forEach(function(sub) {
          var card = document.createElement('div');
          card.className = 'submission-card';
          card.setAttribute('data-id', sub.id);

          var statusClass = 'status-' + sub.screeningStatus;
          var dotColor = '#eab308';
          var pulsing = '';
          if (sub.screeningStatus === 'approved' || sub.screeningStatus === 'scored') dotColor = '#10b981';
          else if (sub.screeningStatus === 'rejected') dotColor = '#ef4444';
          else if (sub.screeningStatus === 'needs_input') dotColor = '#3b82f6';
          if (sub.screeningStatus === 'pending' || sub.screeningStatus === 'screening') pulsing = ' pulsing';

          card.innerHTML =
            '<div class="submission-card-top">' +
              '<span class="submission-card-title">' + escapeHtmlClient(sub.title) + '</span>' +
              '<span class="submission-card-status ' + statusClass + '">' +
                '<span class="submission-card-dot' + pulsing + '" style="background:' + dotColor + '"></span>' +
                (STATUS_LABELS[sub.screeningStatus] || sub.screeningStatus) +
              '</span>' +
            '</div>' +
            '<div class="submission-card-meta">' +
              '<span>' + formatDate(sub.createdAt) + '</span>' +
              (sub.screeningScore ? '<span>Score: ' + sub.screeningScore + '/10</span>' : '') +
            '</div>';

          card.addEventListener('click', function() {
            openSubmission(sub);
          });

          container.appendChild(card);
        });
      }

      function openSubmission(sub) {
        submissionId = sub.id;
        saveActiveSubmission(sub.id);

        switch (sub.screeningStatus) {
          case 'pending':
          case 'screening':
            showStep('screening');
            startPolling();
            break;
          case 'needs_input':
            renderQuestions(sub.questions || []);
            showStep('questions');
            break;
          case 'approved':
          case 'scored':
            renderSuccess(sub);
            showStep('result');
            break;
          case 'rejected':
            renderRejection(sub);
            showStep('result');
            break;
          default:
            showStep('history');
        }
      }

      function saveActiveSubmission(id) {
        try {
          localStorage.setItem('embed_active_' + CONFIG.projectId, id);
        } catch(e) {}
      }

      function getActiveSubmission() {
        try {
          return localStorage.getItem('embed_active_' + CONFIG.projectId);
        } catch(e) { return null; }
      }

      function clearActiveSubmission() {
        try {
          localStorage.removeItem('embed_active_' + CONFIG.projectId);
        } catch(e) {}
      }

      $('btn-new-submission').addEventListener('click', function() {
        clearActiveSubmission();
        submissionId = null;
        $('input-title').value = '';
        $('input-desc').value = '';
        attachedFiles = [];
        renderFileList();
        hideGlobalError();
        hideError($('error-title'));
        hideError($('error-desc'));
        $('btn-submit').disabled = false;
        $('btn-submit').textContent = lang.submit;
        showStep('submit');
      });

      // Back to history from result page
      window.__backToHistory = function() {
        stopPolling();
        clearActiveSubmission();
        submissionId = null;
        loadSubmissions();
      };

      // --- Page Load: fetch submissions and restore state ---
      async function loadSubmissions() {
        try {
          var resp = await fetch('/embed/' + CONFIG.projectId + '/submissions', {
            credentials: 'include'
          });
          if (!resp.ok) {
            showStep('submit');
            return;
          }
          var data = await resp.json();
          var submissions = data.data || [];

          if (submissions.length === 0) {
            showStep('submit');
            return;
          }

          renderSubmissionsList(submissions);

          // Check if there's an active submission to resume
          var activeId = getActiveSubmission();
          if (activeId) {
            var active = submissions.find(function(s) { return s.id === activeId; });
            if (active && isActiveStatus(active.screeningStatus)) {
              openSubmission(active);
              return;
            }
          }

          showStep('history');
        } catch (err) {
          showStep('submit');
        }
      }

      // Initialize page
      loadSubmissions();

    })();
  </script>
</body>
</html>`;
}
