'use client';
import { useState, useEffect, useRef } from 'react';

interface ClickData {
  timestamp: string;
  type: string;
  button?: string;
  message?: string;
}

export default function MouseClickListener() {
  const [isConnected, setIsConnected] = useState(false);
  const [isVideoConnected, setIsVideoConnected] = useState(false);
  const [clickHistory, setClickHistory] = useState<ClickData[]>([]);
  const [lastClick, setLastClick] = useState<ClickData | null>(null);
  const [isListening, setIsListening] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const wsRef = useRef<WebSocket | null>(null);
  const videoWsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Função para tocar som 5 vezes
  const playClickSound = () => {
    if (!soundEnabled) return;
    
    const playBeep = (beepNumber: number) => {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Som de beep personalizado
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Configurar som (frequência de alerta)
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.type = 'sine';
      
      // Envelope do som
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      // Tocar som
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    };
    
    // Reproduzir 5 beeps com intervalo de 0.4 segundos
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        playBeep(i + 1);
      }, i * 400); // 400ms de intervalo entre cada beep
    }
  };

  useEffect(() => {
    // Conectar ao WebSocket de cliques
    const connectWebSocket = () => {
      wsRef.current = new WebSocket('ws://localhost:3000/api/ws');

      wsRef.current.onopen = () => {
        setIsConnected(true);
        console.log('Conectado ao servidor WebSocket (cliques)');
      };

      wsRef.current.onmessage = (event) => {
        const data: ClickData = JSON.parse(event.data);
        
        if (data.type === 'mouse_click') {
          // TOCAR 5 BEEPS quando detectar clique
          playClickSound();
          
          setLastClick(data);
          setClickHistory(prev => [data, ...prev.slice(0, 9)]);
          setIsListening(false);
          
          let timeLeft = 10;
          setCountdown(timeLeft);
          
          const countdownInterval = setInterval(() => {
            timeLeft--;
            setCountdown(timeLeft);
            
            if (timeLeft <= 0) {
              clearInterval(countdownInterval);
            }
          }, 1000);
          
        } else if (data.type === 'detection_reset') {
          setIsListening(true);
          setCountdown(0);
        }
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        setTimeout(connectWebSocket, 3000);
      };
    };

    // Conectar ao WebSocket de vídeo
    const connectVideoWebSocket = () => {
      videoWsRef.current = new WebSocket('ws://localhost:3000/api/video');

      videoWsRef.current.onopen = () => {
        setIsVideoConnected(true);
        console.log('Conectado ao servidor WebSocket (vídeo)');
      };

      videoWsRef.current.onmessage = (event) => {
        // Receber frame de vídeo e desenhar no canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const blob = new Blob([event.data], { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          
          const img = new Image();
          img.onload = () => {
            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
          };
          img.src = url;
        }
      };

      videoWsRef.current.onclose = () => {
        setIsVideoConnected(false);
        setTimeout(connectVideoWebSocket, 3000);
      };
    };

    connectWebSocket();
    connectVideoWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (videoWsRef.current) videoWsRef.current.close();
    };
  }, [soundEnabled]);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🐱 Monitor de Cliques + Live Feed da Webcam</h1>
      
      {/* Controle de som */}
      <div style={{ 
        padding: '10px', 
        backgroundColor: '#f5f5f5', 
        borderRadius: '8px', 
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input 
            type="checkbox" 
            checked={soundEnabled}
            onChange={(e) => setSoundEnabled(e.target.checked)}
          />
          <span>🔊 Som habilitado (5 beeps)</span>
        </label>
        <button 
          onClick={playClickSound}
          style={{
            padding: '5px 10px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          🎵 Testar som (5x)
        </button>
      </div>
      
      {/* Status das conexões */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <div style={{ 
          padding: '15px', 
          borderRadius: '8px',
          backgroundColor: isConnected ? '#4CAF50' : '#f44336',
          color: 'white',
          flex: 1
        }}>
          <h3>{isConnected ? '🟢 CLIQUES OK' : '🔴 CLIQUES OFF'}</h3>
        </div>
        
        <div style={{ 
          padding: '15px', 
          borderRadius: '8px',
          backgroundColor: isVideoConnected ? '#4CAF50' : '#f44336',
          color: 'white',
          flex: 1
        }}>
          <h3>{isVideoConnected ? '🟢 VÍDEO OK' : '🔴 VÍDEO OFF'}</h3>
        </div>
      </div>

      {/* Live Feed da Webcam */}
      <div style={{ marginBottom: '20px' }}>
        <h2>📹 Live Feed da Webcam</h2>
        <canvas 
          ref={canvasRef}
          width={640}
          height={480}
          style={{ 
            border: '2px solid #ddd',
            borderRadius: '8px',
            backgroundColor: '#000',
            maxWidth: '100%',
            height: 'auto'
          }}
        />
      </div>

      {/* Status de escuta com countdown */}
      <div style={{ 
        padding: '15px', 
        borderRadius: '8px',
        backgroundColor: isListening ? '#FF9800' : '#9E9E9E',
        color: 'white',
        marginBottom: '20px'
      }}>
        <h3>{isListening ? '👂 OUVINDO CLIQUES...' : '⏰ AGUARDANDO RESET'}</h3>
        {!isListening && countdown > 0 && (
          <p>Voltando a procurar cliques em: <strong>{countdown}s</strong></p>
        )}
      </div>

      {/* Clique detectado */}
      {lastClick && lastClick.type === 'mouse_click' && (
        <div style={{ 
          padding: '15px', 
          backgroundColor: '#2196F3',
          color: 'white',
          borderRadius: '8px',
          marginBottom: '20px',
          animation: 'pulse 2s infinite'
        }}>
          <h3>🖱️ CLIQUE DETECTADO! 🔊 x5</h3>
          <p>Horário: {new Date(lastClick.timestamp).toLocaleTimeString()}</p>
          <p><em>Sistema pausado por 10 segundos...</em></p>
        </div>
      )}

      {/* Histórico */}
      <div>
        <h3>Histórico de Cliques:</h3>
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {clickHistory.filter(click => click.type === 'mouse_click').map((click, index) => (
            <div key={index} style={{ 
              padding: '10px', 
              borderBottom: '1px solid #ddd',
              backgroundColor: index === 0 ? '#e3f2fd' : 'white'
            }}>
              <strong>{new Date(click.timestamp).toLocaleTimeString()}</strong> - 
              Clique {click.button} {index === 0 && '🔊x5'}
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.02); opacity: 0.8; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
