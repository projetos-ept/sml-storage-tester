const CONTENT_TYPE_MAP = {
  'pdf': 'application/pdf',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function getContentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
}

function previewImg(input) {
  const preview = document.getElementById('preview');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.innerHTML = `<img src="${e.target.result}">`;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function setStatus(type, title, steps) {
  const el = document.getElementById('status');
  const header = document.getElementById('statusHeader');
  const body = document.getElementById('statusBody');
  el.className = `status show ${type}`;
  const icons = { loading: '<span class="spinner"></span>', success: '✓', error: '✗' };
  header.innerHTML = `${icons[type]} ${title}`;
  body.innerHTML = steps.map(s =>
    `<div class="step ${s.state}"><div class="step-dot"></div><span>${s.text}</span></div>`
  ).join('');
}

function addResultLink(url) {
  const body = document.getElementById('statusBody');
  body.innerHTML += `<a class="result-link" href="${url}" target="_blank">↗ ${url}</a>`;
}

async function runUpload() {
  const endpoint = document.getElementById('endpoint').value.trim().replace(/\/$/, '');
  const apikey   = document.getElementById('apikey').value.trim();
  const projeto  = document.getElementById('projeto').value.trim();
  const filename = document.getElementById('filename').value.trim() || 'upload.pdf';
  const tag1     = document.getElementById('tag1').value.trim();
  const tag2     = document.getElementById('tag2').value.trim();
  const tag3     = document.getElementById('tag3').value.trim();
  const imgFile  = document.getElementById('imgfile').files[0];

  if (!endpoint || !apikey) {
    setStatus('error', 'Configuração incompleta', [{ state: 'fail', text: 'Preencha o endpoint e a x-api-key.' }]);
    return;
  }
  if (!imgFile) {
    setStatus('error', 'Nenhuma imagem', [{ state: 'fail', text: 'Selecione uma imagem para converter.' }]);
    return;
  }

  const btn = document.getElementById('btnUpload');
  btn.disabled = true;

  const steps = [
    { state: 'active', text: 'Convertendo imagem para PDF...' },
    { state: '', text: 'Solicitando URL de upload...' },
    { state: '', text: 'Enviando arquivo para o Storage...' },
    { state: '', text: 'Confirmando upload...' },
  ];
  setStatus('loading', 'Processando...', steps);

  try {
    // 1 — Gerar PDF
    const imgData = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(imgFile);
    });

    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = imgData;
    });

    const { jsPDF } = window.jspdf;
    const isLandscape = img.width > img.height;
    const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'px', format: [img.width, img.height] });
    pdf.addImage(imgData, 'JPEG', 0, 0, img.width, img.height);
    const pdfBlob = pdf.output('blob');

    steps[0].state = 'done';
    steps[0].text = 'PDF gerado (' + (pdfBlob.size / 1024).toFixed(1) + ' KB)';
    steps[1].state = 'active';
    setStatus('loading', 'Processando...', steps);

    // 2 — Pedir signed URL
    console.log('[getUploadUrl] Iniciando requisição...');
    const urlRes = await fetch(`${endpoint}/getUploadUrl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apikey },
      body: JSON.stringify({ projeto, filename: filename.endsWith('.pdf') ? filename : filename + '.pdf', tag1, tag2, tag3 })
    });
    const urlData = await urlRes.json();
    console.log('[getUploadUrl] Response status:', urlRes.status);
    console.log('[getUploadUrl] Response headers:', {
      contentType: urlRes.headers.get('content-type'),
      contentLength: urlRes.headers.get('content-length')
    });
    console.log('[getUploadUrl] Response body completo:', urlData);
    if (!urlData.success) throw new Error(urlData.error || 'Erro ao obter URL');

    steps[1].state = 'done';
    steps[1].text = 'URL de upload obtida';
    steps[2].state = 'active';
    setStatus('loading', 'Processando...', steps);

    // 3 — Upload direto
    const contentType = getContentType(filename);
    console.log('[PUT Upload] Iniciando upload de arquivo...');
    console.log('[PUT Upload] Signed URL:', urlData.uploadUrl);
    console.log('[PUT Upload] Content-Type sendo usado:', contentType);
    console.log('[PUT Upload] Tamanho do arquivo (bytes):', pdfBlob.size);
    const putRes = await fetch(urlData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: pdfBlob
    });
    console.log('[PUT Upload] Status HTTP retornado:', putRes.status);
    console.log('[PUT Upload] Response headers:', {
      contentType: putRes.headers.get('content-type'),
      etag: putRes.headers.get('etag'),
      contentLength: putRes.headers.get('content-length')
    });
    if (!putRes.ok) {
      const errText = await putRes.text();
      console.log('[PUT Upload] Response body (erro):', errText);
      throw new Error(`Falha no upload: HTTP ${putRes.status}`);
    }

    steps[2].state = 'done';
    steps[2].text = 'Arquivo enviado para o Storage';
    steps[3].state = 'active';
    setStatus('loading', 'Processando...', steps);

    // 4 — Confirmar
    console.log('[confirmUpload] Iniciando confirmação...');
    const confirmRes = await fetch(`${endpoint}/confirmUpload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apikey },
      body: JSON.stringify({ docId: urlData.docId })
    });
    const confirmData = await confirmRes.json();
    console.log('[confirmUpload] Response status:', confirmRes.status);
    console.log('[confirmUpload] Response headers:', {
      contentType: confirmRes.headers.get('content-type'),
      contentLength: confirmRes.headers.get('content-length')
    });
    console.log('[confirmUpload] Response body completo:', confirmData);
    if (!confirmData.success) throw new Error(confirmData.error || 'Erro na confirmação');

    steps[3].state = 'done';
    steps[3].text = 'Upload confirmado no Firestore';
    setStatus('success', 'Upload concluído com sucesso', steps);
    addResultLink(confirmData.url);

  } catch (err) {
    const failIdx = steps.findIndex(s => s.state === 'active');
    if (failIdx >= 0) { steps[failIdx].state = 'fail'; steps[failIdx].text += ' — ' + err.message; }
    setStatus('error', 'Erro no upload', steps);
  } finally {
    btn.disabled = false;
  }
}

function generateTestImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x <= canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#333333';
  ctx.font = 'bold 48px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TESTE RÁPIDO', canvas.width / 2, canvas.height / 2 - 60);

  ctx.font = '20px Arial, sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText('Arquivo gerado automaticamente', canvas.width / 2, canvas.height / 2 + 20);
  ctx.fillText(new Date().toLocaleString('pt-BR'), canvas.width / 2, canvas.height / 2 + 60);

  return canvas.toDataURL('image/png');
}

async function runQuickTest() {
  const endpoint = document.getElementById('endpoint').value.trim().replace(/\/$/, '');
  const apikey = document.getElementById('apikey').value.trim();

  if (!endpoint || !apikey) {
    setStatus('error', 'Configuração incompleta', [{ state: 'fail', text: 'Preencha o endpoint e a x-api-key antes de fazer o teste.' }]);
    return;
  }

  const btn = document.getElementById('btnQuickTest');
  btn.disabled = true;

  try {
    const testImageData = generateTestImage();
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = testImageData;
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [img.width, img.height] });
    pdf.addImage(testImageData, 'PNG', 0, 0, img.width, img.height);
    const pdfBlob = pdf.output('blob');

    document.getElementById('projeto').value = 'teste-rapido';
    document.getElementById('filename').value = 'teste-rapido.pdf';
    document.getElementById('tag1').value = 'auto-gerado';
    document.getElementById('tag2').value = '';
    document.getElementById('tag3').value = '';

    const steps = [
      { state: 'done', text: 'PDF gerado (' + (pdfBlob.size / 1024).toFixed(1) + ' KB)' },
      { state: 'active', text: 'Solicitando URL de upload...' },
      { state: '', text: 'Enviando arquivo para o Storage...' },
      { state: '', text: 'Confirmando upload...' },
    ];
    setStatus('loading', 'Teste rápido em andamento...', steps);

    const contentType = 'application/pdf';
    const urlRes = await fetch(`${endpoint}/getUploadUrl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apikey },
      body: JSON.stringify({ projeto: 'teste-rapido', filename: 'teste-rapido.pdf', tag1: 'auto-gerado', tag2: '', tag3: '' })
    });
    const urlData = await urlRes.json();
    if (!urlData.success) throw new Error(urlData.error || 'Erro ao obter URL');

    steps[1].state = 'done';
    steps[1].text = 'URL de upload obtida';
    steps[2].state = 'active';
    setStatus('loading', 'Teste rápido em andamento...', steps);

    const putRes = await fetch(urlData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: pdfBlob
    });
    if (!putRes.ok) throw new Error(`Falha no upload: HTTP ${putRes.status}`);

    steps[2].state = 'done';
    steps[2].text = 'Arquivo enviado para o Storage';
    steps[3].state = 'active';
    setStatus('loading', 'Teste rápido em andamento...', steps);

    const confirmRes = await fetch(`${endpoint}/confirmUpload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apikey },
      body: JSON.stringify({ docId: urlData.docId })
    });
    const confirmData = await confirmRes.json();
    if (!confirmData.success) throw new Error(confirmData.error || 'Erro na confirmação');

    steps[3].state = 'done';
    steps[3].text = 'Upload confirmado no Firestore';
    setStatus('success', 'Teste rápido concluído com sucesso!', steps);
    addResultLink(confirmData.url);

  } catch (err) {
    const failIdx = steps.findIndex(s => s.state === 'active');
    if (failIdx >= 0) { steps[failIdx].state = 'fail'; steps[failIdx].text += ' — ' + err.message; }
    setStatus('error', 'Erro no teste rápido', steps);
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnUpload').addEventListener('click', runUpload);
  document.getElementById('btnQuickTest').addEventListener('click', runQuickTest);
});
