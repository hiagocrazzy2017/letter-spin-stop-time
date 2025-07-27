import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Settings, 
  Users, 
  MessageCircle, 
  Trophy, 
  Clock, 
  Send,
  Crown,
  Medal,
  Award,
  Hand,
  Copy,
  Loader2,
  RotateCcw
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { io, Socket } from 'socket.io-client';

type GameState = 'setup' | 'waiting' | 'spinning' | 'playing' | 'voting' | 'reviewing' | 'finished';

interface Player {
  id: string;
  name: string;
  totalScore?: number;
  isHost: boolean;
  isReady: boolean;
}

interface Category {
  id: string;
  label: string;
  active: boolean;
}

interface GameConfig {
  rounds: number;
  timePerRound: number;
  categories: Category[];
  excludeDifficultLetters: boolean;
}

interface ChatMessage {
  id: number;
  playerId?: string;
  playerName?: string;
  message: string;
  timestamp: number;
  type: 'player' | 'system';
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'nome', label: 'Nome', active: true },
  { id: 'animal', label: 'Animal', active: true },
  { id: 'objeto', label: 'Objeto', active: true },
  { id: 'comida', label: 'Comida', active: true },
  { id: 'lugar', label: 'Lugar', active: true },
  { id: 'profissao', label: 'Profissão', active: false },
  { id: 'marca', label: 'Marca', active: false },
  { id: 'cor', label: 'Cor', active: false },
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIFFICULT_LETTERS = ['K', 'W', 'Y'];

const Index = () => {
  const [gameState, setGameState] = useState<GameState>('setup');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [gameRoom, setGameRoom] = useState<any>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameConfig, setGameConfig] = useState<GameConfig>({
    rounds: 3,
    timePerRound: 60,
    categories: DEFAULT_CATEGORIES,
    excludeDifficultLetters: true
  });
  
  const [currentRound, setCurrentRound] = useState(0);
  const [currentLetter, setCurrentLetter] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSpinning, setIsSpinning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [playerScores, setPlayerScores] = useState<Record<string, number>>({});
  const [isReady, setIsReady] = useState(false);
  const [votingAnswers, setVotingAnswers] = useState<any>(null);
  const [userVotes, setUserVotes] = useState<Record<string, boolean>>({});
  const [roundResult, setRoundResult] = useState<any>(null);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout>();

  // Conectar ao servidor
  useEffect(() => {
    const newSocket = io(window.location.origin);
    setSocket(newSocket);

    newSocket.on('room_created', (data) => {
      setRoomId(data.room.id);
      setCurrentPlayer(data.player);
      setGameRoom(data.room);
      setPlayers(data.room.players);
      setGameState('waiting');
      setConnecting(false);
      toast({
        title: "Sala criada!",
        description: `Código da sala: ${data.room.id}`,
      });
    });

    newSocket.on('room_joined', (data) => {
      setRoomId(data.room.id);
      setCurrentPlayer(data.player);
      setGameRoom(data.room);
      setPlayers(data.room.players);
      setGameState('waiting');
      setConnecting(false);
      toast({
        title: "Entrou na sala!",
        description: `Conectado à sala ${data.room.id}`,
      });
    });

    newSocket.on('game_update', (gameData) => {
      setGameRoom(gameData);
      setPlayers(gameData.players);
      setCurrentRound(gameData.currentRound);
      setCurrentLetter(gameData.currentLetter);
      setPlayerScores(gameData.playerScores);
      setTimeLeft(Math.ceil(gameData.timeRemaining / 1000));
      
      if (gameData.state === 'finished') {
        setGameState('finished');
      } else if (gameData.state === 'waiting') {
        setGameState('waiting');
        setIsReady(false);
      } else if (gameData.state === 'voting') {
        setGameState('voting');
      }
    });

    newSocket.on('round_starting', (data) => {
      setGameState('spinning');
      setIsSpinning(true);
      setCurrentRound(data.round);
    });

    newSocket.on('letter_revealed', (data) => {
      setCurrentLetter(data.letter);
      setIsSpinning(false);
      setGameState('playing');
      setTimeLeft(data.timeLimit);
      
      // Reset answers
      const emptyAnswers: Record<string, string> = {};
      gameConfig.categories.filter(cat => cat.active).forEach(cat => {
        emptyAnswers[cat.id] = '';
      });
      setAnswers(emptyAnswers);
    });

    newSocket.on('voting_started', (data) => {
      setGameState('voting');
      setVotingAnswers(data.answers);
      setUserVotes({});
    });

    newSocket.on('round_ended', (data) => {
      setGameState('reviewing');
      setTimeLeft(0);
      setPlayerScores(data.totalScores);
      setRoundResult(data);
      setVotingAnswers(null);
      setUserVotes({});
    });

    newSocket.on('game_finished', (data) => {
      setGameState('finished');
    });

    newSocket.on('chat_message', (message) => {
      setChatMessages(prev => [...prev, message]);
    });

    newSocket.on('error', (error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
      setConnecting(false);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Scroll automático do chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Timer da partida
  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, gameState]);

  const createRoom = () => {
    if (!playerName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Digite seu nome para criar uma sala.",
        variant: "destructive"
      });
      return;
    }
    
    setConnecting(true);
    socket?.emit('create_room', { playerName: playerName.trim() });
  };

  const joinRoom = () => {
    if (!playerName.trim() || !joinRoomId.trim()) {
      toast({
        title: "Dados obrigatórios",
        description: "Digite seu nome e o código da sala.",
        variant: "destructive"
      });
      return;
    }
    
    setConnecting(true);
    socket?.emit('join_room', { 
      roomId: joinRoomId.toUpperCase().trim(), 
      playerName: playerName.trim() 
    });
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || !socket) return;
    
    socket.emit('send_message', chatInput.trim());
    setChatInput('');
  };

  const updateGameConfig = (newConfig: Partial<GameConfig>) => {
    if (!currentPlayer?.isHost || !socket) return;
    
    const updatedConfig = { ...gameConfig, ...newConfig };
    setGameConfig(updatedConfig);
    socket.emit('configure_game', updatedConfig);
  };

  const submitAnswers = () => {
    if (!socket) return;
    socket.emit('submit_answers', answers);
  };

  const startGame = () => {
    if (!currentPlayer?.isHost || !socket) return;
    
    if (players.length < 2) {
      toast({
        title: "Aguarde mais jogadores",
        description: "É necessário pelo menos 2 jogadores para começar.",
        variant: "destructive"
      });
      return;
    }

    const allReady = players.every(p => p.isReady);
    if (!allReady) {
      toast({
        title: "Aguarde todos os jogadores",
        description: "Todos os jogadores devem estar prontos para iniciar.",
        variant: "destructive"
      });
      return;
    }
    
    socket.emit('start_game');
  };

  const callStop = () => {
    if (gameState !== 'playing' || !socket) return;
    
    socket.emit('call_stop');
    toast({
      title: "STOP!",
      description: "Finalizando a rodada...",
    });
  };

  const nextRound = () => {
    if (!currentPlayer?.isHost || !socket) return;
    socket.emit('next_round');
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast({
      title: "Código copiado!",
      description: "Código da sala copiado para a área de transferência.",
    });
  };

  const restartGame = () => {
    if (!currentPlayer?.isHost || !socket) return;
    socket.emit('restart_game');
  };

  const toggleReady = () => {
    if (!socket) return;
    const newReady = !isReady;
    setIsReady(newReady);
    socket.emit('player_ready', newReady);
  };

  const voteAnswer = (answerId: string, isValid: boolean) => {
    if (!socket || userVotes[answerId] !== undefined) return;
    socket.emit('vote_answer', { answerId, isValid });
    setUserVotes(prev => ({ ...prev, [answerId]: isValid }));
  };

  const finishVoting = () => {
    if (!currentPlayer?.isHost || !socket) return;
    socket.emit('finish_voting');
  };

  const getRankingPosition = (playerId: string) => {
    const sortedPlayers = players
      .map(p => ({ ...p, score: playerScores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score);
    return sortedPlayers.findIndex(p => p.id === playerId) + 1;
  };

  const getRankingIcon = (position: number) => {
    switch (position) {
      case 1: return <Crown className="w-5 h-5 text-game-winner" />;
      case 2: return <Medal className="w-5 h-5 text-game-second" />;
      case 3: return <Award className="w-5 h-5 text-game-third" />;
      default: return <span className="text-game-neutral font-bold">{position}º</span>;
    }
  };

  if (gameState === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-primary/10 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              PulseStop
            </h1>
            <p className="text-xl text-muted-foreground">Jogo de Adedonha Online Multiplayer</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Criar Sala */}
            <Card className="game-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Criar Nova Sala
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="playerName">Seu Nome</Label>
                  <Input
                    id="playerName"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Digite seu nome"
                    className="mt-1"
                  />
                </div>
                
                <Button 
                  onClick={createRoom} 
                  className="w-full"
                  disabled={connecting}
                >
                  {connecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    'Criar Sala'
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Entrar na Sala */}
            <Card className="game-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Entrar em Sala
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="playerNameJoin">Seu Nome</Label>
                  <Input
                    id="playerNameJoin"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Digite seu nome"
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="roomCode">Código da Sala</Label>
                  <Input
                    id="roomCode"
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                    placeholder="Digite o código"
                    className="mt-1"
                  />
                </div>
                
                <Button 
                  onClick={joinRoom} 
                  className="w-full"
                  disabled={connecting}
                >
                  {connecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    'Entrar na Sala'
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-primary/10 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Sala: {roomId}
            </h1>
            <Button 
              onClick={copyRoomId} 
              variant="outline" 
              className="mb-4"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copiar Código
            </Button>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Configurações (só para o host) */}
            {currentPlayer?.isHost && (
              <Card className="game-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Configurações da Partida
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="rounds">Rodadas</Label>
                      <Input
                        id="rounds"
                        type="number"
                        min="1"
                        max="10"
                        value={gameConfig.rounds}
                        onChange={(e) => updateGameConfig({ rounds: parseInt(e.target.value) || 1 })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="time">Tempo (segundos)</Label>
                      <Input
                        id="time"
                        type="number"
                        min="30"
                        max="180"
                        value={gameConfig.timePerRound}
                        onChange={(e) => updateGameConfig({ timePerRound: parseInt(e.target.value) || 60 })}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="difficult"
                      checked={gameConfig.excludeDifficultLetters}
                      onCheckedChange={(checked) => 
                        updateGameConfig({ excludeDifficultLetters: checked as boolean })
                      }
                    />
                    <Label htmlFor="difficult">Excluir letras difíceis (K, W, Y)</Label>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Categorias</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {gameConfig.categories.map((category) => (
                        <div key={category.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={category.id}
                            checked={category.active}
                            onCheckedChange={(checked) => {
                              const updatedCategories = gameConfig.categories.map(cat =>
                                cat.id === category.id ? { ...cat, active: checked as boolean } : cat
                              );
                              updateGameConfig({ categories: updatedCategories });
                            }}
                          />
                          <Label htmlFor={category.id} className="text-sm">{category.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

                </CardContent>
              </Card>
            )}

            {/* Lista de Jogadores */}
            <Card className="game-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Jogadores ({players.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                   {players.map((player) => (
                    <div key={player.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback>{player.name.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1">{player.name}</span>
                      <div className="flex gap-2">
                        {player.isReady && (
                          <Badge variant="default" className="bg-green-500">
                            Pronto
                          </Badge>
                        )}
                        {player.isHost && (
                          <Badge variant="secondary">
                            <Crown className="w-3 h-3 mr-1" />
                            Host
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Botão Pronto para o jogador atual */}
                  <div className="pt-4">
                    <Button 
                      onClick={toggleReady}
                      variant={isReady ? "default" : "outline"}
                      className="w-full"
                    >
                      {isReady ? "✓ Pronto!" : "Marcar como Pronto"}
                    </Button>
                  </div>
                  
                  {/* Botão Start para o host */}
                  {currentPlayer?.isHost && (
                    <div className="pt-2">
                      <Button 
                        onClick={startGame}
                        className="w-full"
                        disabled={players.length < 2 || !players.every(p => p.isReady)}
                      >
                        {players.length < 2 
                          ? 'Aguarde mais jogadores'
                          : !players.every(p => p.isReady)
                          ? 'Aguarde todos estarem prontos'
                          : 'Iniciar Jogo'
                        }
                      </Button>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-4">
                    {players.length < 2 
                      ? 'Aguardando mais jogadores...'
                      : 'Todos devem estar prontos para iniciar!'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/10 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header do Jogo */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              PulseStop
            </h1>
            <Badge variant="secondary" className="text-sm">
              Rodada {currentRound} de {gameConfig.rounds}
            </Badge>
          </div>
          
          <div className="flex items-center gap-4">
            {gameState === 'playing' && (
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <span className="text-2xl font-bold text-primary">{timeLeft}s</span>
              </div>
            )}
            <Button
              variant="outline"
              onClick={restartGame}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reiniciar
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Área Principal do Jogo */}
          <div className="lg:col-span-3 space-y-6">
            {/* Roleta/Letra */}
            <Card className="game-card">
              <CardContent className="py-8">
                <div className="text-center">
                  {gameState === 'spinning' && (
                    <div className="space-y-4">
                      <div className="text-6xl">🎮</div>
                      <p className="text-xl">Preparando o jogo...</p>
                    </div>
                  )}
                  
                  {gameState === 'spinning' && (
                    <div className="space-y-4">
                      <div className={`text-8xl font-bold ${isSpinning ? 'spinner-wheel' : ''}`}>
                        🎯
                      </div>
                      <p className="text-xl">Sorteando letra...</p>
                    </div>
                  )}
                  
                  {(gameState === 'playing' || gameState === 'reviewing') && (
                    <div className="space-y-4">
                      <div className={`text-9xl font-bold text-primary ${currentLetter ? 'letter-bounce' : ''}`}>
                        {currentLetter}
                      </div>
                      <p className="text-xl">Letra da rodada</p>
                      {gameState === 'playing' && (
                        <Progress 
                          value={(timeLeft / gameConfig.timePerRound) * 100} 
                          className="w-64 mx-auto"
                        />
                      )}
                    </div>
                  )}
                  
                  {gameState === 'finished' && (
                    <div className="space-y-4">
                      <div className="text-6xl">🏆</div>
                      <p className="text-2xl font-bold">Jogo Finalizado!</p>
                      <div className="winner-glow p-4 rounded-lg border">
                        <p className="text-lg">Vencedor: <span className="font-bold text-game-winner">
                          {[...players].sort((a, b) => (playerScores[b.id] || 0) - (playerScores[a.id] || 0))[0]?.name}
                        </span></p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Formulário de Respostas */}
            {gameState === 'playing' && (
              <Card className="game-card">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Suas Respostas - Letra {currentLetter}</CardTitle>
                    <Button
                      onClick={callStop}
                      variant="destructive"
                      className="flex items-center gap-2"
                    >
                      <Hand className="w-4 h-4" />
                      STOP!
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    {gameConfig.categories.filter(cat => cat.active).map((category) => (
                      <div key={category.id}>
                        <Label htmlFor={category.id}>{category.label}</Label>
                        <Input
                          id={category.id}
                          value={answers[category.id] || ''}
                          onChange={(e) => setAnswers(prev => ({
                            ...prev,
                            [category.id]: e.target.value
                          }))}
                          placeholder={`${category.label} com ${currentLetter}...`}
                          className="mt-1"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Votação de Respostas */}
            {gameState === 'voting' && votingAnswers && (
              <Card className="game-card">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    Votação - Rodada {currentRound}
                    {currentPlayer?.isHost && (
                      <Button onClick={finishVoting} size="sm">
                        Finalizar Votação
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {gameConfig.categories.filter(cat => cat.active).map((category) => {
                      const categoryAnswers = Object.entries(votingAnswers).filter(
                        ([_, answerData]: [string, any]) => answerData.categoryId === category.id
                      );
                      
                      if (categoryAnswers.length === 0) return null;
                      
                      return (
                        <div key={category.id} className="p-4 border rounded-lg">
                          <h4 className="font-semibold mb-3">{category.label}</h4>
                          <div className="space-y-3">
                            {categoryAnswers.map(([answerId, answerData]: [string, any]) => {
                              const userVoted = userVotes[answerId] !== undefined;
                              const isOwnAnswer = answerData.playerId === currentPlayer?.id;
                              
                              return (
                                <div key={answerId} className="flex items-center justify-between p-3 border rounded-lg">
                                  <div>
                                    <span className="font-medium">{answerData.playerName}: </span>
                                    <span className="text-lg">{answerData.answer}</span>
                                  </div>
                                  {!isOwnAnswer && (
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant={userVoted && userVotes[answerId] ? "default" : "outline"}
                                        onClick={() => voteAnswer(answerId, true)}
                                        disabled={userVoted}
                                        className="bg-green-500 hover:bg-green-600"
                                      >
                                        ✓ Vale
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant={userVoted && !userVotes[answerId] ? "destructive" : "outline"}
                                        onClick={() => voteAnswer(answerId, false)}
                                        disabled={userVoted}
                                      >
                                        ✗ Não Vale
                                      </Button>
                                    </div>
                                  )}
                                  {isOwnAnswer && (
                                    <Badge variant="secondary">Sua resposta</Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    Vote se as respostas são válidas. Não é possível votar na própria resposta.
                  </p>
                </CardContent>
              </Card>
            )}
            
            {/* Resultados da Rodada */}
            {gameState === 'reviewing' && roundResult && !votingAnswers && (
              <Card className="game-card">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    Resultados - Rodada {currentRound}
                    {currentPlayer?.isHost && currentRound < gameConfig.rounds && (
                      <Button onClick={nextRound}>
                        Próxima Rodada
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {gameConfig.categories.filter(cat => cat.active).map((category) => (
                      <div key={category.id} className="p-4 border rounded-lg">
                        <h4 className="font-semibold mb-2">{category.label}</h4>
                        <div className="space-y-2">
                          {players.map((player) => {
                            const playerAnswers = roundResult.answers[player.id];
                            const answer = playerAnswers?.answers[category.id] || '';
                            const playerScore = roundResult.scores[player.id] || 0;
                            
                            return (
                              <div key={player.id} className="flex justify-between items-center p-2 rounded bg-muted/50">
                                <div>
                                  <span className="font-medium">{player.name}: </span>
                                  <span className={answer ? "text-foreground" : "text-muted-foreground"}>
                                    {answer || '(sem resposta)'}
                                  </span>
                                </div>
                                <Badge variant={playerScore > 0 ? "default" : "secondary"}>
                                  +{playerScore} pts
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar - Jogadores e Chat */}
          <div className="space-y-6">
            {/* Placar */}
            <Card className="game-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  Placar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...players].sort((a, b) => (playerScores[b.id] || 0) - (playerScores[a.id] || 0)).map((player) => {
                    const position = getRankingPosition(player.id);
                    return (
                      <div 
                        key={player.id} 
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          position === 1 ? 'bg-game-winner/10 border-game-winner/30' : 
                          position === 2 ? 'bg-game-second/10 border-game-second/30' :
                          position === 3 ? 'bg-game-third/10 border-game-third/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {getRankingIcon(position)}
                          <Avatar className="w-8 h-8">
                            <AvatarFallback>
                              {player.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{player.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{playerScores[player.id] || 0}</span>
                          <div className="w-2 h-2 bg-success rounded-full"></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Chat */}
            <Card className="game-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Chat
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div 
                  ref={chatContainerRef}
                  className="h-64 overflow-y-auto p-4 space-y-2"
                >
                  {chatMessages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`chat-message p-2 rounded-lg ${
                        msg.type === 'system' 
                          ? 'bg-muted text-muted-foreground text-center text-sm' 
                          : 'bg-primary/10'
                      }`}
                    >
                      {msg.type === 'player' && (
                        <div className="flex items-start gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-xs">
                              {(msg.playerName || 'U').substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">{msg.playerName}</div>
                            <div className="text-sm">{msg.message}</div>
                          </div>
                        </div>
                      )}
                      {msg.type === 'system' && msg.message}
                    </div>
                  ))}
                </div>
                
                <div className="p-4 border-t">
                  <div className="flex gap-2">
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Digite sua mensagem..."
                      onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                      className="flex-1"
                    />
                    <Button
                      onClick={sendChatMessage}
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
