# SML Storage Tester

Ferramenta web para testar uploads de imagens convertidas em PDF para Firebase Storage via API.

## Como usar

1. Abra `index.html` em um navegador (ou acesse via GitHub Pages)
2. Preencha a configuração:
   - **Endpoint base**: URL da API (ex: `https://us-east1-sml-storage.cloudfunctions.net`)
   - **x-api-key**: Chave de autenticação da API
3. Selecione uma imagem (JPG, PNG, WebP)
4. Preencha os metadados:
   - **Projeto**: Nome do projeto
   - **Filename**: Nome do arquivo PDF
   - **Tags**: Até 3 tags opcionais
5. Clique em "Converter e Enviar"

## Debug

Abra o DevTools do navegador (F12 → Console) para ver logs detalhados de cada etapa:

- `[getUploadUrl]` — Request/response para obter signed URL
- `[PUT Upload]` — Content-Type, signed URL e status HTTP do upload
- `[confirmUpload]` — Response da confirmação no Firestore

## Estrutura

- `index.html` — Interface HTML e CSS
- `app.js` — Lógica de JavaScript (não inline, compatível com CSP)

## Features

- Converte imagem em PDF automaticamente
- Suporta orientação automática (portrait/landscape)
- Exibe tamanho do PDF gerado
- Mostra URL pública do arquivo após sucesso
- Logs detalhados no console para debug
