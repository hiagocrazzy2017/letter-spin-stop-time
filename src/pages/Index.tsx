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
  Play, 
  Users, 
  MessageCircle, 
  Trophy, 
  Clock, 
  Send,
  Crown,
  Medal,
  Award,
  Hand,
  RotateCcw
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type GameState = 'setup' | 'waiting' | 'spinning' | 'playing' | 'reviewing' | 'finished';

interface Player {
  id: string;
  name: string;
  score: number;
  answers: Record<string, string>;
  isHost: boolean;
  isOnline: boolean;
}

interface Category {
  id: string;
  name: string;
  enabled: boolean;
}

interface GameConfig {
  rounds: number;
  timePerRound: number;
  categories: Category[];
  excludeDifficultLetters: boolean;
}

interface ChatMessage {
  id: string;
  player: string;
  message: string;
  timestamp: Date;
  type: 'message' | 'system';
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'nome', name: 'Nome', enabled: true },
  { id: 'animal', name: 'Animal', enabled: true },
  { id: 'objeto', name: 'Objeto', enabled: true },
  { id: 'comida', name: 'Comida', enabled: true },
  { id: 'lugar', name: 'Lugar', enabled: true },
  { id: 'profissao', name: 'Profissão', enabled: false },
  { id: 'marca', name: 'Marca', enabled: false },
  { id: 'filme', name: 'Filme/Série', enabled: false },
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIFFICULT_LETTERS = ['K', 'W', 'Y'];

const Index = () => {
  const [gameState, setGameState] = useState<GameState>('setup');
  const [currentPlayer, setCurrentPlayer] = useState<Player>({
    id: '1',
    name: '',
    score: 0,
    answers: {},
    isHost: true,
    isOnline: true
  });
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameConfig, setGameConfig] = useState<GameConfig>({
    rounds: 5,
    timePerRound: 60,
    categories: DEFAULT_CATEGORIES,
    excludeDifficultLetters: true
  });
  
  const [currentRound, setCurrentRound] = useState(1);
  const [currentLetter, setCurrentLetter] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSpinning, setIsSpinning] = useState(false);
  const [letterDisplayed, setLetterDisplayed] = useState('');
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout>();

  // Simular jogadores online
  useEffect(() => {
    const mockPlayers = [
      { id: '2', name: 'Ana', score: 0, answers: {}, isHost: false, isOnline: true },
      { id: '3', name: 'Bruno', score: 0, answers: {}, isHost: false, isOnline: true },
      { id: '4', name: 'Carla', score: 0, answers: {}, isHost: false, isOnline: true },
    ];
    setPlayers([currentPlayer, ...mockPlayers]);
  }, [currentPlayer]);

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
    } else if (gameState === 'playing' && timeLeft === 0) {
      handleTimeUp();
    }
    
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, gameState]);

  const addSystemMessage = (message: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      player: 'Sistema',
      message,
      timestamp: new Date(),
      type: 'system'
    };
    setChatMessages(prev => [...prev, newMessage]);
  };

  const handleTimeUp = () => {
    setGameState('reviewing');
    addSystemMessage('Tempo esgotado!');
    
    setTimeout(() => {
      calculateScores();
    }, 2000);
  };

  const sendChatMessage = () => {
    if (!chatInput.trim()) return;
    
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      player: currentPlayer.name,
      message: chatInput,
      timestamp: new Date(),
      type: 'message'
    };
    
    setChatMessages(prev => [...prev, newMessage]);
    setChatInput('');
  };

  const startGame = () => {
    if (!currentPlayer.name.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Digite seu nome para começar a jogar.",
        variant: "destructive"
      });
      return;
    }

    setGameState('waiting');
    addSystemMessage(`${currentPlayer.name} iniciou uma nova partida!`);
    
    setTimeout(() => {
      setGameState('spinning');
      spinLetter();
    }, 2000);
  };

  const spinLetter = () => {
    setIsSpinning(true);
    setLetterDisplayed('');
    
    const availableLetters = gameConfig.excludeDifficultLetters 
      ? ALPHABET.filter(letter => !DIFFICULT_LETTERS.includes(letter))
      : ALPHABET;
    
    const randomLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
    
    // Simular animação da roleta
    setTimeout(() => {
      setCurrentLetter(randomLetter);
      setLetterDisplayed(randomLetter);
      setIsSpinning(false);
      
      setTimeout(() => {
        setGameState('playing');
        setTimeLeft(gameConfig.timePerRound);
        addSystemMessage(`Rodada ${currentRound} começou! Letra: ${randomLetter}`);
        
        // Reset answers
        const emptyAnswers: Record<string, string> = {};
        gameConfig.categories.filter(cat => cat.enabled).forEach(cat => {
          emptyAnswers[cat.id] = '';
        });
        setAnswers(emptyAnswers);
      }, 1000);
    }, 3000);
  };

  const callStop = () => {
    if (gameState !== 'playing') return;
    
    setGameState('reviewing');
    setTimeLeft(0);
    addSystemMessage(`${currentPlayer.name} gritou STOP!`);
    toast({
      title: "STOP!",
      description: "Finalizando a rodada...",
    });
    
    setTimeout(() => {
      calculateScores();
    }, 2000);
  };

  const calculateScores = () => {
    // Simular pontuação dos outros jogadores
    const updatedPlayers = players.map(player => {
      if (player.id === currentPlayer.id) {
        const validAnswers = Object.values(answers).filter(answer => answer.trim().length > 0);
        const roundScore = validAnswers.length * 10; // 10 pontos por resposta válida
        return { ...player, score: player.score + roundScore };
      } else {
        // Simular respostas dos outros jogadores
        const randomScore = Math.floor(Math.random() * 50) + 10;
        return { ...player, score: player.score + randomScore };
      }
    });
    
    setPlayers(updatedPlayers);
    
    if (currentRound >= gameConfig.rounds) {
      setGameState('finished');
      addSystemMessage('Jogo finalizado!');
    } else {
      setTimeout(() => {
        setCurrentRound(currentRound + 1);
        setGameState('spinning');
        spinLetter();
      }, 5000);
    }
  };

  const resetGame = () => {
    setGameState('setup');
    setCurrentRound(1);
    setCurrentLetter('');
    setTimeLeft(0);
    setAnswers({});
    setPlayers(prev => prev.map(p => ({ ...p, score: 0 })));
    setChatMessages([]);
  };

  const getRankingPosition = (player: Player) => {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    return sortedPlayers.findIndex(p => p.id === player.id) + 1;
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
            {/* Configurações do Jogo */}
            <Card className="game-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Configurações da Partida
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="playerName">Seu Nome</Label>
                  <Input
                    id="playerName"
                    value={currentPlayer.name}
                    onChange={(e) => setCurrentPlayer(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Digite seu nome"
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="rounds">Rodadas</Label>
                    <Input
                      id="rounds"
                      type="number"
                      min="1"
                      max="10"
                      value={gameConfig.rounds}
                      onChange={(e) => setGameConfig(prev => ({ ...prev, rounds: parseInt(e.target.value) || 1 }))}
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
                      onChange={(e) => setGameConfig(prev => ({ ...prev, timePerRound: parseInt(e.target.value) || 60 }))}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="difficult"
                    checked={gameConfig.excludeDifficultLetters}
                    onCheckedChange={(checked) => 
                      setGameConfig(prev => ({ ...prev, excludeDifficultLetters: checked as boolean }))
                    }
                  />
                  <Label htmlFor="difficult">Excluir letras difíceis (K, W, Y)</Label>
                </div>
              </CardContent>
            </Card>

            {/* Categorias */}
            <Card className="game-card">
              <CardHeader>
                <CardTitle>Categorias</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {gameConfig.categories.map((category) => (
                    <div key={category.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={category.id}
                        checked={category.enabled}
                        onCheckedChange={(checked) => {
                          setGameConfig(prev => ({
                            ...prev,
                            categories: prev.categories.map(cat =>
                              cat.id === category.id ? { ...cat, enabled: checked as boolean } : cat
                            )
                          }));
                        }}
                      />
                      <Label htmlFor={category.id} className="text-sm">{category.name}</Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-8">
            <Button
              onClick={startGame}
              size="lg"
              className="btn-game text-lg px-8 py-4"
            >
              <Play className="w-5 h-5 mr-2" />
              Iniciar Jogo
            </Button>
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
              onClick={resetGame}
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
                  {gameState === 'waiting' && (
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
                      <div className={`text-9xl font-bold text-primary ${letterDisplayed ? 'letter-bounce' : ''}`}>
                        {letterDisplayed}
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
                          {[...players].sort((a, b) => b.score - a.score)[0]?.name}
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
                    {gameConfig.categories.filter(cat => cat.enabled).map((category) => (
                      <div key={category.id}>
                        <Label htmlFor={category.id}>{category.name}</Label>
                        <Input
                          id={category.id}
                          value={answers[category.id] || ''}
                          onChange={(e) => setAnswers(prev => ({
                            ...prev,
                            [category.id]: e.target.value
                          }))}
                          placeholder={`${category.name} com ${currentLetter}...`}
                          className="mt-1"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Revisão de Respostas */}
            {gameState === 'reviewing' && (
              <Card className="game-card">
                <CardHeader>
                  <CardTitle>Respostas da Rodada {currentRound}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {gameConfig.categories.filter(cat => cat.enabled).map((category) => (
                      <div key={category.id} className="p-4 border rounded-lg">
                        <h4 className="font-semibold mb-2">{category.name}</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {players.map((player) => (
                            <div key={player.id} className="text-sm">
                              <span className="font-medium">{player.name}:</span>
                              <span className="ml-1">
                                {player.id === currentPlayer.id 
                                  ? answers[category.id] || '-'
                                  : `Palavra${Math.random() > 0.3 ? ` com ${currentLetter}` : ' inválida'}`
                                }
                              </span>
                            </div>
                          ))}
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
                  {[...players].sort((a, b) => b.score - a.score).map((player) => {
                    const position = getRankingPosition(player);
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
                          <span className="font-bold">{player.score}</span>
                          {player.isOnline && (
                            <div className="w-2 h-2 bg-success rounded-full"></div>
                          )}
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
                      {msg.type === 'message' && (
                        <div className="flex items-start gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-xs">
                              {msg.player.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">{msg.player}</div>
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
