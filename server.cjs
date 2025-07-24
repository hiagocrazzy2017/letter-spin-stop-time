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

/// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'dist')));
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
    this.state = 'waiting'; // waiting, playing, reviewing, finished
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
    if (this.state === 'waiting' && this.players.size >= 2) {
      this.state = 'playing';
      this.currentRound = 1;
      this.startNewRound();
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
      this.state = 'reviewing';
      return playerId;
    }
    return null;
  }

  calculateRoundScores() {
    const roundScores = new Map();
    const categoryAnswers = new Map();

    // Organizar respostas por categoria
    const activeCategories = this.config.categories.filter(cat => cat.active);
    
    activeCategories.forEach(category => {
      categoryAnswers.set(category.id, new Map());
    });

    // Coletar todas as respostas
    this.roundAnswers.forEach((playerData, playerId) => {
      roundScores.set(playerId, 0);
      
      activeCategories.forEach(category => {
        const answer = playerData.answers[category.id];
        if (answer && answer.trim()) {
          const normalizedAnswer = answer.trim().toLowerCase();
          if (!categoryAnswers.get(category.id).has(normalizedAnswer)) {
            categoryAnswers.get(category.id).set(normalizedAnswer, []);
          }
          categoryAnswers.get(category.id).get(normalizedAnswer).push(playerId);
        }
      });
    });

    // Calcular pontuação
    this.roundAnswers.forEach((playerData, playerId) => {
      let playerRoundScore = 0;

      activeCategories.forEach(category => {
        const answer = playerData.answers[category.id];
        if (answer && answer.trim()) {
          const normalizedAnswer = answer.trim().toLowerCase();
          const playersWithSameAnswer = categoryAnswers.get(category.id).get(normalizedAnswer);
          
          // Verificar se a palavra começa com a letra correta
          if (normalizedAnswer.charAt(0).toUpperCase() === this.currentLetter) {
            if (playersWithSameAnswer.length === 1) {
              playerRoundScore += 10; // Resposta única
            } else {
              playerRoundScore += 5;  // Resposta repetida
            }
          }
          // Senão, 0 pontos
        }
      });

      roundScores.set(playerId, playerRoundScore);
      
      // Atualizar pontuação total
      const currentTotal = this.playerScores.get(playerId) || 0;
      this.playerScores.set(playerId, currentTotal + playerRoundScore);
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
      timeRemaining: this.roundEndTime ? Math.max(0, this.roundEndTime - Date.now()) : 0
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
    
    if (room.state !== 'waiting') {
      socket.emit('error', { message: 'Jogo já em andamento' });
      return;
    }
    
    if (room.players.size >= 8) {
      socket.emit('error', { message: 'Sala lotada' });
      return;
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
        
        // Timer automático para finalizar rodada
        setTimeout(() => {
          if (room.state === 'playing') {
            room.state = 'reviewing';
            const roundScores = room.calculateRoundScores();
            
            io.to(socket.roomId).emit('round_ended', {
              reason: 'timeout',
              answers: Object.fromEntries(room.roundAnswers),
              scores: Object.fromEntries(roundScores),
              totalScores: Object.fromEntries(room.playerScores)
            });
            
            io.to(socket.roomId).emit('game_update', room.getGameState());
          }
        }, room.config.timePerRound * 1000);
        
      }, 3000);
      
      console.log(`Jogo iniciado na sala ${socket.roomId}`);
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
      const roundScores = room.calculateRoundScores();
      
      const systemMessage = room.addSystemMessage(`${player.name} gritou STOP!`);
      
      io.to(socket.roomId).emit('stop_called', {
        callerId: stopCallerId,
        callerName: player.name
      });
      
      io.to(socket.roomId).emit('round_ended', {
        reason: 'stop',
        caller: player.name,
        answers: Object.fromEntries(room.roundAnswers),
        scores: Object.fromEntries(roundScores),
        totalScores: Object.fromEntries(room.playerScores)
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
        
        // Timer automático
        setTimeout(() => {
          if (room.state === 'playing') {
            room.state = 'reviewing';
            const roundScores = room.calculateRoundScores();
            
            io.to(socket.roomId).emit('round_ended', {
              reason: 'timeout',
              answers: Object.fromEntries(room.roundAnswers),
              scores: Object.fromEntries(roundScores),
              totalScores: Object.fromEntries(room.playerScores)
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

// Rota fallback para SPA (Vite/React build)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor Stop/Adedonha rodando na porta ${PORT}`);
  console.log(`🎮 Pronto para receber jogadores!`);
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
