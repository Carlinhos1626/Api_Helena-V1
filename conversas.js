const express = require('express');
const axios = require('axios');
const mysql = require('mysql2/promise');
const { RateLimiter } = require('limiter');

const app = express();
const port = 3000;

// Configuração do MySQL
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'api-helena'
};

// Configuração do Rate Limiter
const limiter = new RateLimiter({
  tokensPerInterval: 1000,
  interval: 5 * 60 * 1000 // 5 minutes in milliseconds
});

// Função para criar conexão com o banco de dados
async function createConnection() {
  return await mysql.createConnection(dbConfig);
}

// Função para salvar dados no banco de dados
async function saveData(connection, data) {
  const sql = `INSERT INTO api_helena 
    (contact_name, contact_phonenumber, contact_phonenumberFormatted,
    agent_name, agent_phoneNumber, agent_email,
    platform, categoryDescription, lastInteractionDate, startAt, endAt) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const values = [
    data.contactDetails?.name ?? null,
    data.contactDetails?.phonenumber ?? null,
    data.contactDetails?.phonenumberFormatted ?? null,
    data.agentDetails?.name ?? null,
    data.agentDetails?.phoneNumber ?? null,
    data.agentDetails?.email ?? null,
    data.channelDetails?.platform ?? null,
    data.classification?.categoryDescription ?? null,
    data.lastInteractionDate ?? null,
    data.startAt ?? null,
    data.endAt ?? null
  ];

  await connection.execute(sql, values);
}

// Função para fazer requisição à API Helena
async function fetchHelenaData(pageNumber, pageSize) {
  await limiter.removeTokens(1);
  const options = {
    method: 'GET',
    url: `https://api.helena.run/chat/v1/session?Status=COMPLETED&DepartmentId=32024ebf-6cc1-469a-acec-8e70ad5463c3&IncludeDetails=AgentDetails&IncludeDetails=ContactDetails&IncludeDetails=ClassificationDetails&IncludeDetails=ChannelDetails&PageNumber=${pageNumber}&PageSize=${pageSize}`,
    headers: {
      accept: 'application/json',
      Authorization: 'Bearer pn_cuqmdfzkWQzXhYQQ9OWJEui06tTgBBr5osCWulV2w'
    }
  };

  const response = await axios.request(options);
  return response.data;
}

// Rota para extrair todas as conversas antigas
app.get('/extract-all', async (req, res) => {
  try {
    const connection = await createConnection();
    const pageSize = 100;
    const totalPages = Math.ceil(7759 / pageSize);

    for (let page = 1; page <= totalPages; page++) {
      const data = await fetchHelenaData(page, pageSize);
      for (const item of data.items) {
        await saveData(connection, item);
      }
      console.log(`Página ${page}/${totalPages} processada`);
    }

    await connection.end();
    res.json({ message: 'Extração de todas as conversas concluída.' });
  } catch (error) {
    console.error('Erro na extração:', error);
    res.status(500).json({ error: 'Erro na extração de dados' });
  }
});

// Rota para verificar e extrair novas conversas
app.get('/check-new', async (req, res) => {
  try {
    const connection = await createConnection();
    const data = await fetchHelenaData(1, 1);
    const latestConversation = data.items[0];

    // Verificar se a conversa já existe no banco de dados
    const [rows] = await connection.execute('SELECT id FROM api_helena WHERE startAt = ?', [latestConversation.startAt]);

    if (rows.length === 0) {
      await saveData(connection, latestConversation);
      res.json({ message: 'Nova conversa extraída e salva.', conversation: latestConversation });
    } else {
      res.json({ message: 'Nenhuma nova conversa encontrada.' });
    }

    await connection.end();
  } catch (error) {
    console.error('Erro na verificação de novas conversas:', error);
    res.status(500).json({ error: 'Erro na verificação de novas conversas' });
  }
});

app.listen(port, () => {
  console.log(`API Helena rodando na porta ${port}`);
});