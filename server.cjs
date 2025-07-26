const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Servir arquivos estáticos do diretório dist
const distPath = path.join(__dirname, 'dist');
console.log('Diretório atual:', __dirname);
console.log('Procurando arquivos estáticos em:', distPath);
app.use(express.static(distPath));
// Estado do jogo
const gameRooms = new Map();

// Categorias padrão
const DEFAULT_CATEGORIES = [
  { id: 'nome', label: 'Nome', active: true },
  { id: 'animal', label: 'Animal', active: true },
  { id: 'objeto', label: 'Objeto', active: true },
  { id: 'lugar', label: 'Lugar', active: true },
  { id: 'comida', label: 'Comida', active: true },
  { id: 'cor', label: 'Cor', active: false },
  { id: 'marca', label: 'Marca', active: false },
  { id: 'profissao', label: 'Profissão', active: false }
];

// Letras disponíveis (sem as difíceis)
const ALL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'Z'];
const EASY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'V'];

class GameRoom {
  constructor(roomId, hostId) {
    this.id = roomId;
    this.hostId = hostId;
    this.players = new Map();
    this.state = 'waiting'; // waiting, playing, reviewing, voting, finished
    this.config = {
      rounds: 3,
      timePerRound: 60,
      categories: DEFAULT_CATEGORIES,
      excludeDifficultLetters: true
    };
    this.currentRound = 0;
    this.currentLetter = null;
    this.roundStartTime = null;
    this.roundEndTime = null;
    this.roundAnswers = new Map();
    this.playerScores = new Map();
    this.gameHistory = [];
    this.chatMessages = [];
    this.votes = new Map(); // Para votação das respostas
    this.votingAnswers = new Map(); // Respostas sendo votadas
  }

  addPlayer(playerId, playerName) {
    const player = {
      id: playerId,
      name: playerName,
      isHost: playerId === this.hostId,
      isReady: false,
      totalScore: 0
    };
    this.players.set(playerId, player);
    this.playerScores.set(playerId, 0);
    return player;
  }

  setPlayerReady(playerId, ready) {
    const player = this.players.get(playerId);
    if (player) {
      player.isReady = ready;
      return true;
    }
    return false;
  }

  allPlayersReady() {
    return Array.from(this.players.values()).every(player => player.isReady);
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.playerScores.delete(playerId);
    this.roundAnswers.delete(playerId);
    
    // Se o host saiu, promover outro jogador
    if (playerId === this.hostId && this.players.size > 0) {
      const newHost = Array.from(this.players.values())[0];
      this.hostId = newHost.id;
      newHost.isHost = true;
    }
  }

  updateConfig(newConfig) {
    if (this.state === 'waiting') {
      this.config = { ...this.config, ...newConfig };
      return true;
    }
    return false;
  }

  startGame() {
    if (this.state === 'waiting' && this.players.size >= 2 && this.allPlayersReady()) {
      this.state = 'playing';
      this.currentRound = 1;
      this.startNewRound();
      // Reset ready status
      this.players.forEach(player => {
        player.isReady = false;
      });
      return true;
    }
    return false;
  }

  startNewRound() {
    this.roundAnswers.clear();
    this.currentLetter = this.generateRandomLetter();
    this.roundStartTime = Date.now();
    this.roundEndTime = this.roundStartTime + (this.config.timePerRound * 1000);
  }

  generateRandomLetter() {
    const letters = this.config.excludeDifficultLetters ? EASY_LETTERS : ALL_LETTERS;
    return letters[Math.floor(Math.random() * letters.length)];
  }

  submitAnswers(playerId, answers) {
    if (this.state === 'playing' && Date.now() < this.roundEndTime) {
      this.roundAnswers.set(playerId, {
        answers,
        submittedAt: Date.now()
      });
      return true;
    }
    return false;
  }

  callStop(playerId) {
    if (this.state === 'playing') {
      this.roundEndTime = Date.now();
      this.state = 'voting';
      this.prepareVoting();
      return playerId;
    }
    return null;
  }

  prepareVoting() {
    this.votes.clear();
    this.votingAnswers.clear();
    
    const activeCategories = this.config.categories.filter(cat => cat.active);
    
    // Organizar respostas para votação
    this.roundAnswers.forEach((playerData, playerId) => {
      const player = this.players.get(playerId);
      activeCategories.forEach(category => {
        const answer = playerData.answers[category.id];
        if (answer && answer.trim()) {
          const answerId = `${playerId}_${category.id}`;
          this.votingAnswers.set(answerId, {
            playerId,
            playerName: player.name,
            categoryId: category.id,
            categoryLabel: category.label,
            answer: answer.trim(),
            letter: this.currentLetter,
            validVotes: 0,
            invalidVotes: 0,
            voters: new Set()
          });
        }
      });
    });
  }

  submitVote(voterId, answerId, isValid) {
    const answerData = this.votingAnswers.get(answerId);
    if (!answerData || answerData.voters.has(voterId) || answerData.playerId === voterId) {
      return false; // Não pode votar na própria resposta ou votar duas vezes
    }

    answerData.voters.add(voterId);
    if (isValid) {
      answerData.validVotes++;
    } else {
      answerData.invalidVotes++;
    }

    return true;
  }

  finishVoting() {
    const roundScores = new Map();
    
    // Inicializar pontuações
    this.roundAnswers.forEach((playerData, playerId) => {
      roundScores.set(playerId, 0);
    });

    // Calcular pontuações baseadas na votação
    this.votingAnswers.forEach((answerData) => {
      const totalVotes = answerData.validVotes + answerData.invalidVotes;
      const isAnswerValid = answerData.validVotes > answerData.invalidVotes;
      
      // Verificar se a palavra começa com a letra correta
      const startsWithCorrectLetter = answerData.answer.charAt(0).toUpperCase() === this.currentLetter;
      
      if (isAnswerValid && startsWithCorrectLetter && totalVotes > 0) {
        // Contar quantas respostas válidas existem para esta categoria
        const categoryAnswers = Array.from(this.votingAnswers.values())
          .filter(a => a.categoryId === answerData.categoryId)
          .filter(a => {
            const totalV = a.validVotes + a.invalidVotes;
            return totalV > 0 && a.validVotes > a.invalidVotes && 
                   a.answer.charAt(0).toUpperCase() === this.currentLetter;
          });

        const uniqueAnswers = new Set(categoryAnswers.map(a => a.answer.toLowerCase()));
        const isUnique = uniqueAnswers.size === categoryAnswers.length;
        
        if (isUnique) {
          const currentScore = roundScores.get(answerData.playerId) || 0;
          roundScores.set(answerData.playerId, currentScore + 10); // Resposta única
        } else {
          const currentScore = roundScores.get(answerData.playerId) || 0;
          roundScores.set(answerData.playerId, currentScore + 5); // Resposta repetida
        }
      }
    });

    // Atualizar pontuações totais
    roundScores.forEach((roundScore, playerId) => {
      const currentTotal = this.playerScores.get(playerId) || 0;
      this.playerScores.set(playerId, currentTotal + roundScore);
    });

    this.state = 'reviewing';
    return roundScores;
  }

  calculateRoundScores() {
    // Este método agora é usado apenas como fallback
    // A pontuação principal é calculada no finishVoting()
    const roundScores = new Map();
    this.roundAnswers.forEach((playerData, playerId) => {
      roundScores.set(playerId, 0);
    });
    return roundScores;
  }

  getGameState() {
    return {
      id: this.id,
      state: this.state,
      config: this.config,
      currentRound: this.currentRound,
      currentLetter: this.currentLetter,
      roundStartTime: this.roundStartTime,
      roundEndTime: this.roundEndTime,
      players: Array.from(this.players.values()),
      playerScores: Object.fromEntries(this.playerScores),
      timeRemaining: this.roundEndTime ? Math.max(0, this.roundEndTime - Date.now()) : 0,
      votingAnswers: this.state === 'voting' ? Object.fromEntries(this.votingAnswers) : null,
      roundAnswers: this.state === 'reviewing' ? Object.fromEntries(this.roundAnswers) : null
    };
  }

  addChatMessage(playerId, message) {
    const player = this.players.get(playerId);
    if (player) {
      const chatMessage = {
        id: Date.now(),
        playerId,
        playerName: player.name,
        message: message.trim(),
        timestamp: Date.now(),
        type: 'player'
      };
      this.chatMessages.push(chatMessage);
      return chatMessage;
    }
    return null;
  }

  addSystemMessage(message) {
    const chatMessage = {
      id: Date.now(),
      message,
      timestamp: Date.now(),
      type: 'system'
    };
    this.chatMessages.push(chatMessage);
    return chatMessage;
  }
}

// Utilitários
function generateRoomId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Socket.IO eventos
io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // Criar sala
  socket.on('create_room', (data) => {
    const { playerName } = data;
    const roomId = generateRoomId();
    
    const room = new GameRoom(roomId, socket.id);
    const player = room.addPlayer(socket.id, playerName);
    gameRooms.set(roomId, room);
    
    socket.join(roomId);
    socket.roomId = roomId;
    
    const systemMessage = room.addSystemMessage(`${playerName} criou a sala`);
    
    socket.emit('room_created', {
      room: room.getGameState(),
      player
    });
    
    io.to(roomId).emit('game_update', room.getGameState());
    io.to(roomId).emit('chat_message', systemMessage);
    
    console.log(`Sala criada: ${roomId} por ${playerName}`);
  });

  // Entrar na sala
  socket.on('join_room', (data) => {
    const { roomId, playerName } = data;
    const room = gameRooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }
    
    if (room.players.size >= 8) {
      socket.emit('error', { message: 'Sala lotada' });
      return;
    }
    
    // Se o jogo está em andamento, reset automático
    if (room.state !== 'waiting') {
      room.state = 'waiting';
      room.currentRound = 0;
      room.currentLetter = null;
      room.roundStartTime = null;
      room.roundEndTime = null;
      room.roundAnswers.clear();
      room.players.forEach((player, id) => {
        room.playerScores.set(id, 0);
      });
      room.gameHistory = [];
      
      const resetMessage = room.addSystemMessage('Jogo resetado - novo jogador entrou');
      io.to(roomId).emit('chat_message', resetMessage);
    }
    
    const player = room.addPlayer(socket.id, playerName);
    socket.join(roomId);
    socket.roomId = roomId;
    
    const systemMessage = room.addSystemMessage(`${playerName} entrou na sala`);
    
    socket.emit('room_joined', {
      room: room.getGameState(),
      player
    });
    
    io.to(roomId).emit('game_update', room.getGameState());
    io.to(roomId).emit('chat_message', systemMessage);
    
    
    console.log(`${playerName} entrou na sala ${roomId}`);
  });

  // Marcar jogador como pronto
  socket.on('player_ready', (ready) => {
    const room = gameRooms.get(socket.roomId);
    if (!room) return;
    
    if (room.setPlayerReady(socket.id, ready)) {
      const player = room.players.get(socket.id);
      const message = ready ? `${player.name} está pronto` : `${player.name} não está mais pronto`;
      const systemMessage = room.addSystemMessage(message);
      
      io.to(socket.roomId).emit('game_update', room.getGameState());
      io.to(socket.roomId).emit('chat_message', systemMessage);
    }
  });

  // Configurar jogo
  socket.on('configure_game', (config) => {
    const room = gameRooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) {
      socket.emit('error', { message: 'Apenas o host pode configurar o jogo' });
      return;
    }
    
    if (room.updateConfig(config)) {
      io.to(socket.roomId).emit('game_update', room.getGameState());
      console.log(`Configuração atualizada na sala ${socket.roomId}`);
    }
  });

  // Iniciar jogo
  socket.on('start_game', () => {
    const room = gameRooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) {
      socket.emit('error', { message: 'Apenas o host pode iniciar o jogo' });
      return;
    }
    
    if (room.startGame()) {
      const systemMessage = room.addSystemMessage('Jogo iniciado! Boa sorte!');
      
      // Animar roleta (enviar letra após 3 segundos)
      io.to(socket.roomId).emit('round_starting', {
        round: room.currentRound,
        totalRounds: room.config.rounds
      });
      
      setTimeout(() => {
        io.to(socket.roomId).emit('letter_revealed', {
          letter: room.currentLetter,
          timeLimit: room.config.timePerRound
        });
        
        io.to(socket.roomId).emit('game_update', room.getGameState());
        io.to(socket.roomId).emit('chat_message', systemMessage);
        
        // Timer automático para ir para votação
        setTimeout(() => {
          if (room.state === 'playing') {
            room.state = 'voting';
            room.prepareVoting();
            
            io.to(socket.roomId).emit('voting_started', {
              answers: Object.fromEntries(room.votingAnswers)
            });
            
            io.to(socket.roomId).emit('game_update', room.getGameState());
          }
        }, room.config.timePerRound * 1000);
        
      }, 3000);
      
      console.log(`Jogo iniciado na sala ${socket.roomId}`);
    } else {
      socket.emit('error', { message: 'Todos os jogadores devem estar prontos para iniciar' });
    }
  });

  // Enviar respostas
  socket.on('submit_answers', (answers) => {
    const room = gameRooms.get(socket.roomId);
    if (!room) return;
    
    if (room.submitAnswers(socket.id, answers)) {
      const player = room.players.get(socket.id);
      const systemMessage = room.addSystemMessage(`${player.name} enviou as respostas`);
      
      io.to(socket.roomId).emit('player_submitted', {
        playerId: socket.id,
        playerName: player.name
      });
      
      io.to(socket.roomId).emit('chat_message', systemMessage);
      
      console.log(`${player.name} enviou respostas na sala ${socket.roomId}`);
    }
  });

  // Chamar STOP
  socket.on('call_stop', () => {
    const room = gameRooms.get(socket.roomId);
    if (!room) return;
    
    const stopCallerId = room.callStop(socket.id);
    if (stopCallerId) {
      const player = room.players.get(stopCallerId);
      
      const systemMessage = room.addSystemMessage(`${player.name} gritou STOP!`);
      
      io.to(socket.roomId).emit('stop_called', {
        callerId: stopCallerId,
        callerName: player.name
      });
      
      io.to(socket.roomId).emit('voting_started', {
        answers: Object.fromEntries(room.votingAnswers)
      });
      
      io.to(socket.roomId).emit('game_update', room.getGameState());
      io.to(socket.roomId).emit('chat_message', systemMessage);
      
      console.log(`STOP chamado por ${player.name} na sala ${socket.roomId}`);
    }
  });

  // Próxima rodada
  socket.on('next_round', () => {
    const room = gameRooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) {
      socket.emit('error', { message: 'Apenas o host pode avançar' });
      return;
    }
    
    if (room.currentRound < room.config.rounds) {
      room.currentRound++;
      room.state = 'playing';
      room.startNewRound();
      
      const systemMessage = room.addSystemMessage(`Rodada ${room.currentRound} iniciada`);
      
      // Animar roleta novamente
      io.to(socket.roomId).emit('round_starting', {
        round: room.currentRound,
        totalRounds: room.config.rounds
      });
      
      setTimeout(() => {
        io.to(socket.roomId).emit('letter_revealed', {
          letter: room.currentLetter,
          timeLimit: room.config.timePerRound
        });
        
        io.to(socket.roomId).emit('game_update', room.getGameState());
        io.to(socket.roomId).emit('chat_message', systemMessage);
        
        // Timer automático para votação
        setTimeout(() => {
          if (room.state === 'playing') {
            room.state = 'voting';
            room.prepareVoting();
            
            io.to(socket.roomId).emit('voting_started', {
              answers: Object.fromEntries(room.votingAnswers)
            });
            
            io.to(socket.roomId).emit('game_update', room.getGameState());
          }
        }, room.config.timePerRound * 1000);
        
      }, 3000);
      
    } else {
      // Fim do jogo
      room.state = 'finished';
      
      const finalRanking = Array.from(room.playerScores.entries())
        .map(([playerId, score]) => ({
          playerId,
          playerName: room.players.get(playerId).name,
          score
        }))
        .sort((a, b) => b.score - a.score);
      
      const winner = finalRanking[0];
      const systemMessage = room.addSystemMessage(`🏆 ${winner.playerName} venceu com ${winner.score} pontos!`);
      
      io.to(socket.roomId).emit('game_finished', {
        ranking: finalRanking,
        winner
      });
      
      io.to(socket.roomId).emit('game_update', room.getGameState());
      io.to(socket.roomId).emit('chat_message', systemMessage);
      
      console.log(`Jogo finalizado na sala ${socket.roomId}. Vencedor: ${winner.playerName}`);
    }
  });

  // Reiniciar jogo
  socket.on('restart_game', () => {
    const room = gameRooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) {
      socket.emit('error', { message: 'Apenas o host pode reiniciar' });
      return;
    }
    
    // Reset do jogo
    room.state = 'waiting';
    room.currentRound = 0;
    room.currentLetter = null;
    room.roundStartTime = null;
    room.roundEndTime = null;
    room.roundAnswers.clear();
    room.playerScores.clear();
    room.gameHistory = [];
    
    // Reset das pontuações dos jogadores
    room.players.forEach((player, playerId) => {
      room.playerScores.set(playerId, 0);
    });
    
    const systemMessage = room.addSystemMessage('Jogo reiniciado pelo host');
    
    io.to(socket.roomId).emit('game_restarted');
    io.to(socket.roomId).emit('game_update', room.getGameState());
    io.to(socket.roomId).emit('chat_message', systemMessage);
    
    console.log(`Jogo reiniciado na sala ${socket.roomId}`);
  });

  // Votar em resposta
  socket.on('vote_answer', (data) => {
    const { answerId, isValid } = data;
    const room = gameRooms.get(socket.roomId);
    if (!room || room.state !== 'voting') return;
    
    if (room.submitVote(socket.id, answerId, isValid)) {
      io.to(socket.roomId).emit('game_update', room.getGameState());
    }
  });

  // Finalizar votação
  socket.on('finish_voting', () => {
    const room = gameRooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id || room.state !== 'voting') {
      socket.emit('error', { message: 'Apenas o host pode finalizar a votação' });
      return;
    }
    
    const roundScores = room.finishVoting();
    
    io.to(socket.roomId).emit('round_ended', {
      answers: Object.fromEntries(room.roundAnswers),
      scores: Object.fromEntries(roundScores),
      totalScores: Object.fromEntries(room.playerScores),
      votingResults: Object.fromEntries(room.votingAnswers)
    });
    
    io.to(socket.roomId).emit('game_update', room.getGameState());
  });

  // Chat
  socket.on('send_message', (message) => {
    const room = gameRooms.get(socket.roomId);
    if (!room) return;
    
    const chatMessage = room.addChatMessage(socket.id, message);
    if (chatMessage) {
      io.to(socket.roomId).emit('chat_message', chatMessage);
    }
  });

  // Desconexão
  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
    
    if (socket.roomId) {
      const room = gameRooms.get(socket.roomId);
      if (room) {
        const player = room.players.get(socket.id);
        if (player) {
          const systemMessage = room.addSystemMessage(`${player.name} saiu da sala`);
          room.removePlayer(socket.id);
          
          if (room.players.size === 0) {
            // Deletar sala vazia
            gameRooms.delete(socket.roomId);
            console.log(`Sala ${socket.roomId} deletada (vazia)`);
          } else {
            io.to(socket.roomId).emit('game_update', room.getGameState());
            io.to(socket.roomId).emit('chat_message', systemMessage);
          }
        }
      }
    }
  });
});

// Verificar se o arquivo index.html existe
const fs = require('fs');
const indexPath = path.join(distPath, 'index.html');

// Rota fallback para SPA (Vite/React build)
app.get('/', (req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error('index.html não encontrado em:', indexPath);
    res.status(404).send('index.html não encontrado');
  }
});

// Serve outras rotas estáticas se não forem encontradas
app.use((req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error('index.html não encontrado em:', indexPath);
    res.status(404).send('index.html não encontrado');
  }
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor PulseStop rodando na porta ${PORT}`);
  console.log(`🎮 Pronto para receber jogadores!`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// Limpeza periódica de salas vazias
setInterval(() => {
  for (const [roomId, room] of gameRooms.entries()) {
    if (room.players.size === 0) {
      gameRooms.delete(roomId);
      console.log(`🧹 Sala ${roomId} removida (inativa)`);
    }
  }
}, 300000); // 5 minutos

module.exports = { app, server, io };
