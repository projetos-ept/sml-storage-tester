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
    console.log('[PUT Upload] Iniciando upload de arquivo...');
    console.log('[PUT Upload] Signed URL:', urlData.uploadUrl);
    console.log('[PUT Upload] Content-Type sendo usado:', 'application/octet-stream');
    console.log('[PUT Upload] Tamanho do arquivo (bytes):', pdfBlob.size);
    const putRes = await fetch(urlData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnUpload').addEventListener('click', runUpload);
});
