const express = require('express');
const axios = require('axios');
const mysql = require('mysql2/promise');
const cron = require('node-cron');

const app = express();
const port = 3000;

// Configuração da conexão com o banco de dados MySQL
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'api-helena'
};

const baseUrl = 'https://api.helena.run/core/v1/contact';
let totalPages = 53;
const pageSize = 100;

const apiOptions = {
  headers: {
    accept: 'application/json',
    Authorization: 'Bearer pn_cuqmdfzkWQzXhYQQ9OWJEui06tTgBBr5osCWulV2w'
  }
};

async function getLastProcessedPage() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute('SELECT MAX(page_number) as last_page FROM conversations');
    return rows[0].last_page || 0;
  } finally {
    await connection.end();
  }
}

async function updateProcessedPage(pageNumber) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    await connection.execute('INSERT INTO conversations (page_number) VALUES (?)', [pageNumber]);
  } finally {
    await connection.end();
  }
}

async function insertContact(contact) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const {
      name,
      phoneNumber,
      phoneNumberFormatted,
      email,
      instagram
    } = contact;
    await connection.execute(
      'INSERT INTO conversations (contact_name, contact_phonenumber, contact_phonenumberFormatted, email, instagram) VALUES (?, ?, ?, ?, ?)',
      [name || null, phoneNumber || null, phoneNumberFormatted || null, email || null, instagram || null]
    );
    console.log(`Contato ${name || 'sem nome'} inserido com sucesso.`);
  } catch (err) {
    console.error(`Erro ao inserir contato ${contact.name || 'sem nome'}:`, err);
  } finally {
    await connection.end();
  }
}

async function processPage(pageNumber) {
  try {
    const response = await axios.get(`${baseUrl}?IncludeDetails=Tags&Status=ACTIVE&PageNumber=${pageNumber}&PageSize=${pageSize}`, apiOptions);
    const contacts = response.data.items;

    for (const contact of contacts) {
      await insertContact(contact);
    }

    console.log(`Processados ${contacts.length} contatos da página ${pageNumber}.`);
    await updateProcessedPage(pageNumber);

    return response.data.totalPages;
  } catch (error) {
    console.error(`Erro na requisição da página ${pageNumber}:`, error);
    return null;
  }
}

async function checkForNewContacts() {
  const lastProcessedPage = await getLastProcessedPage();
  console.log(`Última página processada: ${lastProcessedPage}`);

  const newTotalPages = await processPage(totalPages);
  if (newTotalPages && newTotalPages > totalPages) {
    console.log(`Detectada nova página. Total de páginas atualizado: ${newTotalPages}`);
    for (let i = totalPages + 1; i <= newTotalPages; i++) {
      await processPage(i);
    }
    totalPages = newTotalPages;
  }
}

// Rota para extrair todos os contatos
app.get('/extract-all-contacts', async (req, res) => {
  const lastProcessedPage = await getLastProcessedPage();
  for (let i = lastProcessedPage + 1; i <= totalPages; i++) {
    await processPage(i);
  }
  res.send('Extração de todos os contatos concluída.');
});

// Rota para verificar e adicionar novos contatos
app.get('/check-new-contacts', async (req, res) => {
  await checkForNewContacts();
  res.send('Verificação e adição de novos contatos concluída.');
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});