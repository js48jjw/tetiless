'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// Add type definitions
interface Tetromino {
  shape: number[][];
  color: string;
  key?: string;
}

// BoardCell type extension
type BoardCell = string | 0 | { color: string; isFalling?: boolean };
type Board = BoardCell[][];
type Position = { x: number; y: number };

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const TETROMINOS: Record<string, Omit<Tetromino, 'key'>> = {
  I: { shape: [[1, 1, 1, 1]], color: 'cyan' },
  O: { shape: [[1, 1], [1, 1]], color: 'yellow' },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: 'purple' },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: 'green' },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: 'red' },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: 'blue' },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: 'orange' }
};

const TETROMINO_KEYS = Object.keys(TETROMINOS);

// Score calculation improvement
const POINTS = {
  SINGLE: 100,
  DOUBLE: 300,
  TRIPLE: 500,
  TETRIS: 800,
  SOFT_DROP: 1,
  HARD_DROP: 2
};

// Sound file path
const SOUND = {
  move: '/sound/move.mp3',
  rotate: '/sound/rotate.mp3',
  hardDrop: '/sound/hardDrop.mp3',
  lineClear: '/sound/lineClear.mp3',
  collapse: '/sound/collapse.mp3',
  bgm: '/sound/tetris_BGM.mp3',
  gameover: '/sound/gameover.mp3',
};

// Only BGM is cached, effects are created every time
const bgmCache: Record<string, HTMLAudioElement> = {};
function safePlaySound(src: string, volume = 1, loop = false) {
  // Only BGM is cached
  if (src === SOUND.bgm) {
    if (!bgmCache[src]) {
      bgmCache[src] = new Audio(src);
    }
    const audio = bgmCache[src];
    audio.volume = volume;
    audio.loop = loop;
    audio.play().catch((e) => {
      if (e.name === 'AbortError') return;
      console.error('Audio playback error:', src, e);
    });
    return audio;
  } else {
    // Effects are created every time
    const audio = new Audio(src);
    audio.volume = volume;
    audio.loop = loop;
    audio.play().catch((e) => {
      if (e.name === 'AbortError') return;
      console.error('Audio playback error:', src, e);
    });
    return audio;
  }
}

// 2. Score/Level/Effect utility function separation (outside component)
function calcLevel(lines: number, startLevel: number = 1) {
  return Math.floor(lines / 10) + (startLevel - 1) + 1;
}

export default function TetrisGame() {
  const [clearingRows, setClearingRows] = useState<number[]>([]);
  const [isClearing, setIsClearing] = useState(false);
  const [lineClearX, setLineClearX] = useState(0);
  const [board, setBoard] = useState<Board>(() => Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(0)));
  const [currentPiece, setCurrentPiece] = useState<Tetromino | null>(null);
  const [currentPosition, setCurrentPosition] = useState<Position>({ x: 0, y: 0 });
  const [nextPiece, setNextPiece] = useState<Tetromino | null>(null);

  const [score, setScore] = useState<number>(0);
  const [level, setLevel] = useState<number>(1);
  const [lines, setLines] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const [startLevel, setStartLevel] = useState<number>(1);
  
  // 7-bag system state
  const bagRef = useRef<string[]>([]);

  const [bgmAudio, setBgmAudio] = useState<HTMLAudioElement | null>(null);
  const [isBgmMuted, setIsBgmMuted] = useState<boolean>(false);

  // Ad area reference
  const adRef = useRef<HTMLDivElement>(null);
  const bottomAdRef = useRef<HTMLDivElement>(null);

  const [isShortMobile, setIsShortMobile] = useState(false);
  useEffect(() => {
    const checkHeight = () => {
      setIsShortMobile(window.innerHeight <= 600);
    };
    checkHeight();
    window.addEventListener('resize', checkHeight);
    return () => window.removeEventListener('resize', checkHeight);
  }, []);

  // 7-bag random generation system (fairer piece distribution)
  const createRandomPiece = useCallback((): Tetromino => {
    if (bagRef.current.length === 0) {
      bagRef.current = [...TETROMINO_KEYS].sort(() => Math.random() - 0.5);
    }
    const randomKey = bagRef.current.pop() as string;
    return {
      ...TETROMINOS[randomKey],
      key: randomKey
    };
  }, []);

  const rotatePiece = (piece: Tetromino): Tetromino => {
    const rotated = piece.shape[0].map((_: number, i: number) =>
      piece.shape.map((row: number[]) => row[i]).reverse()
    );
    return { ...piece, shape: rotated };
  };

  const isValidPosition = (board: Board, piece: Tetromino, pos: Position): boolean => {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const newX = pos.x + x;
          const newY = pos.y + y;
          if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
            return false;
          }
          if (newY >= 0 && board[newY][newX]) {
            return false;
          }
        }
      }
    }
    return true;
  };

  const placePiece = (board: Board, piece: Tetromino, pos: Position): Board => {
    const newBoard = board.map((row: BoardCell[]) => [...row]);
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const boardY = pos.y + y;
          const boardX = pos.x + x;
          if (boardY >= 0) {
            newBoard[boardY][boardX] = piece.color;
          }
        }
      }
    }
    return newBoard;
  };

  // 1. Declare animateLineClear first
  const animateLineClear = useCallback(async (rows: number[], newBoard: Board) => {
    setClearingRows(rows);
    setIsClearing(true);
    setLineClearX(0);
    setHardDropTrail([]);
    const interval = 40; // ms, speed per cell
    for (let x = 0; x <= BOARD_WIDTH; x++) {
      setLineClearX(x);
      await new Promise(res => setTimeout(res, interval));
    }
    setClearingRows([]);
    setIsClearing(false);
    setLineClearX(0);
    setBoard(newBoard);
  }, []);

  // 2. clearLines function
  const clearLines = (board: Board): { board: Board; clearedLines: number; clearedRowIdxs: number[] } => {
    const clearedRowIdxs: number[] = [];
    const newBoard = board.filter((row: BoardCell[], idx) => {
      const isFull = row.every((cell: BoardCell) => cell && typeof cell !== 'object');
      if (isFull) clearedRowIdxs.push(idx);
      return !isFull;
    });
    const clearedLines = BOARD_HEIGHT - newBoard.length;
    const emptyRows = Array(clearedLines).fill(null).map(() => Array(BOARD_WIDTH).fill(0));
    return { board: [...emptyRows, ...newBoard], clearedLines, clearedRowIdxs };
  };

  // 3. spawnNewPiece function
  const spawnNewPiece = useCallback(() => {
    const piece = nextPiece || createRandomPiece();
    const newNextPiece = createRandomPiece();
    const startPos = { 
      x: Math.floor((BOARD_WIDTH - piece.shape[0].length) / 2), 
      y: 0 
    };
    setCurrentPiece(piece);
    setCurrentPosition(startPos);
    setNextPiece(newNextPiece);
    return { piece, startPos };
  }, [nextPiece, createRandomPiece]);

  // 4. Wrap finishHardDrop with useCallback, reference externally with ref
  const finishHardDropRef = useRef<((newY: number, dropDistance: number) => void) | null>(null);
  const finishHardDrop = useCallback((newY: number, dropDistance: number) => {
    setScore(prev => prev + dropDistance * POINTS.HARD_DROP);
    safePlaySound(SOUND.hardDrop, 0.7);
    const newBoard = placePiece(board, currentPiece!, { ...currentPosition, y: newY });
    const { board: clearedBoard, clearedLines, clearedRowIdxs } = clearLines(newBoard);
    if (clearedLines > 0) {
      safePlaySound(SOUND.collapse, 0.7);
      animateLineClear(clearedRowIdxs, clearedBoard);
    } else {
      setBoard(clearedBoard);
    }
    setLines(prev => prev + clearedLines);
    if (clearedLines > 0) {
      let points = 0;
      switch (clearedLines) {
        case 1: points = POINTS.SINGLE; break;
        case 2: points = POINTS.DOUBLE; break;
        case 3: points = POINTS.TRIPLE; break;
        case 4: points = POINTS.TETRIS; break;
      }
      setScore(prev => prev + points * level);
    }
    const newLines = lines + clearedLines;
    const newLevel = calcLevel(newLines, startLevel);
    setLevel(newLevel);
    const { piece: newPiece, startPos } = spawnNewPiece();
    if (!isValidPosition(clearedBoard, newPiece, startPos)) {
      setGameOver(true);
      setGameStarted(false);
      safePlaySound(SOUND.collapse, 1);
      safePlaySound(SOUND.gameover, 1);
    }
  }, [board, currentPiece, currentPosition, level, lines, spawnNewPiece, animateLineClear, startLevel]);
  finishHardDropRef.current = finishHardDrop;

  // 3. BGM management improvement (inside useEffect)
  useEffect(() => {
    if (gameStarted && !gameOver && !isPaused) {
      if (!bgmAudio) {
        const audio = safePlaySound(SOUND.bgm, 0.3, true);
        setBgmAudio(audio);
      } else {
        bgmAudio.play();
      }
    } else {
      bgmAudio?.pause();
    }
    return () => {
      if (bgmAudio) {
        bgmAudio.pause();
        setBgmAudio(null);
      }
    };
  }, [gameStarted, gameOver, isPaused, bgmAudio]);

  // Add interval ref for continuous movement
  const moveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Move
  const movePiece = useCallback((dx: number, dy: number, isPlayerMove = false) => {
    if (!currentPiece || gameOver || isPaused || isClearing) return false;
    const newPos = { x: currentPosition.x + dx, y: currentPosition.y + dy };
    if (isValidPosition(board, currentPiece, newPos)) {
      setCurrentPosition(newPos);
      if (isPlayerMove && dy > 0) {
        setScore(prev => prev + POINTS.SOFT_DROP);
      }
      if (isPlayerMove) safePlaySound(SOUND.move, 0.5);
      return true;
    } else if (dy > 0) {
      const newBoard = placePiece(board, currentPiece, currentPosition);
      const { board: clearedBoard, clearedLines, clearedRowIdxs } = clearLines(newBoard);
      if (clearedLines > 0) {
        safePlaySound(SOUND.collapse, 0.7);
        animateLineClear(clearedRowIdxs, clearedBoard);
      } else {
        setBoard(clearedBoard);
      }
      setLines(prev => prev + clearedLines);
      safePlaySound(SOUND.hardDrop, 0.7);
      if (clearedLines > 0) {
        let points = 0;
        switch (clearedLines) {
          case 1: points = POINTS.SINGLE; break;
          case 2: points = POINTS.DOUBLE; break;
          case 3: points = POINTS.TRIPLE; break;
          case 4: points = POINTS.TETRIS; break;
        }
        setScore(prev => prev + points * level);
      }
      const newLines = lines + clearedLines;
      const newLevel = calcLevel(newLines, startLevel);
      setLevel(newLevel);
      const { piece: newPiece, startPos } = spawnNewPiece();
      if (!isValidPosition(clearedBoard, newPiece, startPos)) {
        setGameOver(true);
        setGameStarted(false);
        safePlaySound(SOUND.collapse, 1);
        safePlaySound(SOUND.gameover, 1);
      }
      return false;
    }
    return false;
  }, [currentPiece, currentPosition, board, gameOver, isPaused, level, lines, spawnNewPiece, isClearing, animateLineClear, startLevel]);

  // Declare rotatePieceHandler first
  const rotatePieceHandler = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;
    const rotatedPiece = rotatePiece(currentPiece);
    
    // Try wall kick (default, left, right, up)
    const wallKicks = [
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: -1, y: -1 },
      { x: 1, y: -1 }
    ];
    
    for (const kick of wallKicks) {
      const testPos = {
        x: currentPosition.x + kick.x,
        y: currentPosition.y + kick.y
      };
      
      if (isValidPosition(board, rotatedPiece, testPos)) {
        setCurrentPiece(rotatedPiece);
        setCurrentPosition(testPos);
        break;
      }
    }
  }, [currentPiece, board, currentPosition, gameOver, isPaused]);

  // Then declare handleRotate function
  const handleRotate = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;
    
    // Allow rotation during continuous movement
    rotatePieceHandler();
    
    // Rotate sound effect
    safePlaySound(SOUND.rotate, 0.5);
  }, [currentPiece, gameOver, isPaused, rotatePieceHandler]);

  // Hard drop trail state
  const [hardDropTrail, setHardDropTrail] = useState<{y: number, x: number, idx: number}[]>([]);

  const dropPiece = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;
    let newY = currentPosition.y;
    while (isValidPosition(board, currentPiece, { ...currentPosition, y: newY + 1 })) {
      newY++;
    }
    // 각 블록 셀(x, y)에 대해 바닥에서 위로 MAX_TRAIL만큼만 잔상
    const trail: {y: number, x: number, idx: number}[] = [];
    for (let y = 0; y < currentPiece.shape.length; y++) {
      for (let x = 0; x < currentPiece.shape[y].length; x++) {
        if (currentPiece.shape[y][x]) {
          const startY = currentPosition.y + y;
          const endY = newY + y;
          let idx = 0;
          for (let ty = endY - 1; ty >= startY; ty--, idx++) {
            trail.push({ y: ty, x: currentPosition.x + x, idx });
          }
        }
      }
    }
    setHardDropTrail(trail);
    setTimeout(() => setHardDropTrail([]), 350);
    finishHardDrop(newY, newY - currentPosition.y);
  }, [currentPiece, currentPosition, board, gameOver, isPaused, finishHardDrop]);

  const startGame = () => {
    setBoard(Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(0)));
    setScore(0);
    setLevel(startLevel);
    setLines(0);
    setGameOver(false);
    setIsPaused(false);
    setGameStarted(true);

    bagRef.current = [];
    
    const nextPiece = createRandomPiece();
    setNextPiece(nextPiece);
    spawnNewPiece();
  };

  // togglePause useCallback으로 감싸기
  const togglePause = useCallback(() => {
    if (gameOver) return;
    setIsPaused((prev: boolean) => !prev);
  }, [gameOver]);

  // 3. 키보드 이벤트 등록 useCallback으로 핸들러 고정
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (!gameStarted) return;
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        movePiece(-1, 0, true);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        movePiece(1, 0, true);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        movePiece(0, 1, true);
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        handleRotate();
        break;
      case ' ':
        e.preventDefault();
        dropPiece();
        break;
      case 'p':
      case 'P':
        e.preventDefault();
        togglePause();
        break;
      case 'Escape':
        e.preventDefault();
        togglePause();
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        setIsBgmMuted((prev: boolean) => !prev);
        break;
    }
  }, [gameStarted, movePiece, handleRotate, dropPiece, togglePause]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // 4. 게임 루프 setTimeout으로 변경
  useEffect(() => {
    if (!gameStarted || gameOver || isPaused) return;
    let timer: number;
    // 레벨별 속도 조정: 1~9레벨은 100ms씩, 10레벨부터는 10ms씩, 최소 50ms
    let dropInterval = 1000;
    if (level <= 9) {
      dropInterval = 1000 - (level - 1) * 100;
    } else {
      dropInterval = Math.max(50, 200 - (level - 10) * 10);
    }
    const loop = () => {
      movePiece(0, 1);
      timer = window.setTimeout(loop, dropInterval);
    };
    timer = window.setTimeout(loop, dropInterval);
    return () => clearTimeout(timer);
  }, [movePiece, level, gameStarted, gameOver, isPaused]);

  // 게임 시작시 첫 조각 생성
  useEffect(() => {
    if (gameStarted && !currentPiece) {
      spawnNewPiece();
    }
  }, [gameStarted, currentPiece, spawnNewPiece]);

  // 5. renderBoard useMemo 적용
  const displayBoard = useMemo(() => {
    const tempBoard = board.map(row => [...row]);
    if (currentPiece && !isClearing) {
      for (let y = 0; y < currentPiece.shape.length; y++) {
        for (let x = 0; x < currentPiece.shape[y].length; x++) {
          if (currentPiece.shape[y][x]) {
            const boardY = currentPosition.y + y;
            const boardX = currentPosition.x + x;
            if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
              tempBoard[boardY][boardX] = currentPiece.color;
            }
          }
        }
      }
    }
    return tempBoard;
  }, [board, currentPiece, currentPosition, isClearing]);

  // getCellColor: string만 처리
  const getCellColor = (cell: BoardCell, y?: number, x?: number): string => {
    let base = '';
    if (!cell) base = 'bg-gray-900 border border-gray-700';
    else if (typeof cell !== 'string') base = 'bg-white';
    else {
      switch (cell) {
        case 'cyan': base = 'bg-gradient-to-t from-cyan-600 to-cyan-300 border border-cyan-600'; break;
        case 'yellow': base = 'bg-gradient-to-t from-yellow-400 to-yellow-200 border border-yellow-400'; break;
        case 'purple': base = 'bg-gradient-to-t from-purple-600 to-purple-300 border border-purple-500'; break;
        case 'green': base = 'bg-gradient-to-t from-green-600 to-green-300 border border-green-500'; break;
        case 'red': base = 'bg-gradient-to-t from-red-600 to-red-300 border border-red-500'; break;
        case 'blue': base = 'bg-gradient-to-t from-blue-600 to-blue-300 border border-blue-500'; break;
        case 'orange': base = 'bg-gradient-to-t from-orange-500 to-orange-200 border border-orange-400'; break;
        default: base = 'bg-white';
      }
    }
    if (typeof y === 'number' && clearingRows.includes(y)) {
      const delay = x ? x * 40 : 0;
      return `${base} tetris-line-clear` + (delay ? ` animate-[tetris-line-clear_0.5s_ease-in_forwards_${delay}ms]` : '');
    }
    return base;
  };

  const renderPiecePreview = (piece: Tetromino | null, size = 'w-16 h-16') => {
    // 항상 4x4 그리드 유지, piece가 없으면 빈칸만
    if (!piece) {
      return (
        <div className={`bg-gray-700 p-1 rounded flex items-center justify-center ${size}`}>
          <div className="grid grid-rows-4 grid-cols-4 gap-px w-full h-full">
            {[...Array(16)].map((_, i) => (
              <div key={i} className="w-full aspect-square" />
            ))}
          </div>
        </div>
      );
    }

    // bounding box(최소 사각형) 중심 계산
    let minY = 4, maxY = -1, minX = 4, maxX = -1;
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    const centerY = (minY + maxY) / 2;
    const centerX = (minX + maxX) / 2;
    // 4x4 그리드의 중심(1.5, 1.5)와 shape 중심의 차이 계산
    const deltaX = 1.5 - centerX;
    const deltaY = 1.5 - centerY;

    return (
      <div className={`bg-gray-700 p-1 rounded flex items-center justify-center ${size}`}>
        <div
          className="grid grid-rows-4 grid-cols-4 gap-px w-full h-full"
          style={{
            transform: `translate(${deltaX * 100 / 4}%, ${deltaY * 100 / 4}%)`,
          }}
        >
          {[...Array(4)].map((_, y) => (
            [...Array(4)].map((_, x) => {
              let cell = 0;
              const shapeY = y;
              const shapeX = x;
              if (
                shapeY >= 0 && shapeY < piece.shape.length &&
                shapeX >= 0 && shapeX < (piece.shape[shapeY]?.length ?? 0)
              ) {
                cell = piece.shape[shapeY][shapeX];
              }
              return (
                <div
                  key={`${y}-${x}`}
                  className={`w-full aspect-square ${cell && typeof piece.color === 'string' ? getCellColor(piece.color) : ''}`}
                />
              );
            })
          ))}
        </div>
      </div>
    );
  };

  useEffect(() => {
    return () => {
      const interval = moveIntervalRef.current;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  // 보드 렌더링 시 trail 인덱스별로 opacity 다르게
  const getTrailIdx = (y: number, x: number) => {
    const t = hardDropTrail.find(t => t.y === y && t.x === x);
    return t ? t.idx : -1;
  };

  // trail 인덱스별로 스타일 반환 (아래가 진하고 위로 갈수록 연해짐)
  const getTrailStyle = (idx: number, totalTrail: number) => {
    const t = totalTrail > 1 ? idx / (totalTrail - 1) : 0;
    const alpha = 0.3 * Math.pow(1 - t, 15.5);
    return {
      background: `rgba(255,255,255,${alpha})`,
      boxShadow: `0 0 8px 2px rgba(255,255,255,${alpha}), 0 0 2px 1px rgba(255,255,255,${alpha})`,
      zIndex: 1,
      animation: 'harddrop-fade 0.35s linear'
    };
  };

  const isEmptyCell = (cell: BoardCell) => !cell;

  useEffect(() => {
    // 광고 스크립트 동적 삽입 (상단)
    if (adRef.current && !adRef.current.querySelector('ins')) {
      const ins = document.createElement('ins');
      ins.className = 'kakao_ad_area';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-unit', 'DAN-L20xzJ2iWK1HTCEE');
      ins.setAttribute('data-ad-width', '100%');
      ins.setAttribute('data-ad-height', '50');
      adRef.current.appendChild(ins);
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '//t1.daumcdn.net/kas/static/ba.min.js';
      script.async = true;
      adRef.current.appendChild(script);
    }
    // 하단 광고 스크립트 동적 삽입
    if (bottomAdRef.current && !bottomAdRef.current.querySelector('ins')) {
      const ins = document.createElement('ins');
      ins.className = 'kakao_ad_area';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-unit', 'DAN-yaHIZPIM4uoqeVpa');
      ins.setAttribute('data-ad-width', '100%');
      ins.setAttribute('data-ad-height', '50');
      bottomAdRef.current.appendChild(ins);
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '//t1.daumcdn.net/kas/static/ba.min.js';
      script.async = true;
      bottomAdRef.current.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (bgmAudio) {
      bgmAudio.muted = isBgmMuted;
    }
  }, [bgmAudio, isBgmMuted]);

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-black text-white min-h-screen" style={{paddingTop: 58, paddingBottom: 58}}>
      {/* 상단 고정 광고 */}
      <div className="fixed top-0 left-0 w-full flex justify-center z-50 bg-black text-white">
        <div ref={adRef} className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl mb-0 bg-black text-white" style={{ minHeight: 50 }} />
      </div>
      <h1
        className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold mb-4 whitespace-nowrap tracking-widest bg-gradient-to-r from-[#FF3B30] via-[#FF9500] via-[#FFCC00] via-[#34C759] via-[#007AFF] via-[#5856D6] to-[#D6A4FF] bg-clip-text text-transparent"
        style={{
          textShadow: `
            0 2px 0 #3b0764,
            0 4px 0 #1e034d,
            0 6px 8px #a78bfa,
            2px 2px 0 #ede9fe,
            0 0 32px #c4b5fd,
            0 8px 16px #0008
          `
        }}
      >
        TETILESS
      </h1>
      <div className="flex flex-row justify-center items-end gap-4 w-full max-w-4xl mx-auto">
        {/* 게임 보드 */}
        <div className="relative bg-black text-white">
          <div className="mx-auto w-full max-w-md border-8 border-gray-400 rounded-2xl p-1 bg-black shadow-[0_0_40px_10px_rgba(34,197,94,0.5)]">
            <div
              className="aspect-[10/20] max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg min-w-[200px] min-h-[400px] grid gap-0 bg-gray-900 p-0 overflow-hidden box-border"
              style={{ gridTemplateColumns: `repeat(${BOARD_WIDTH}, 1fr)` }}
            >
              {displayBoard.map((row, y) =>
                row.map((cell, x) => (
                  <div
                    key={`${y}-${x}`}
                    className={`w-full aspect-square ${getCellColor(cell, y, x)}${clearingRows.includes(y) && x <= lineClearX ? ' line-clear-active' : ''}${getTrailIdx(y, x) >= 0 && isEmptyCell(cell) ? ' harddrop-trail' : ''}`}
                    style={getTrailIdx(y, x) >= 0 && isEmptyCell(cell) ? getTrailStyle(getTrailIdx(y, x), hardDropTrail.length) : {}}
                  />
                ))
              )}
              {/* 게임 오버 오버레이: 게임 보드 내부에만 표시 */}
              {gameOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-80 z-20">
                  <h2 className="text-3xl font-bold text-red-500 mb-3">Game Over</h2>
                  <p className="text-xl text-white mb-2">Score: {score.toLocaleString()}</p>
                  <button
                    onClick={startGame}
                    className="mt-3 px-5 py-2 bg-green-600 hover:bg-green-700 rounded font-bold text-white"
                  >
                    Again
                  </button>
                </div>
              )}
              {/* 일시정지 오버레이: 게임 보드 내부에만 표시 */}
              {isPaused && gameStarted && !gameOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 z-20">
                  <h2 className="text-4xl font-bold text-yellow-300 mb-3">Pause</h2>
                  <button
                    onClick={togglePause}
                    className="mt-3 px-5 py-2 bg-yellow-500 hover:bg-yellow-600 rounded font-bold text-white"
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* (게임창 바로 아래 좌우 버튼 영역 삭제) */}
        </div>
        
        {/* 오른쪽 패널 - 게임 정보 */}
        <div className="space-y-4 bg-black text-white mt-0 flex flex-col items-center">
          {/* NEXT block preview - move to the top */}
          <div className="bg-gray-800 p-1 rounded text-center mb-1">
            <h3 className="text-sm font-bold mb-0 whitespace-nowrap">NEXT</h3>
            <div className="flex justify-center">
              {renderPiecePreview(nextPiece, 'w-16 h-13')}
            </div>
          </div>
          {/* Score, Level, Lines - add more space and keep consistent */}
          <div className="flex flex-col space-y-0 mt-0 pt-0">
            <div className="bg-gray-800 p-1 rounded text-center mb-1">
              <h3 className="text-sm font-bold whitespace-nowrap">Score</h3>
              <p className="text-lg font-mono text-cyan-400 whitespace-nowrap">{score.toLocaleString()}</p>
            </div>
            <div className="bg-gray-800 p-1 rounded text-center mb-1">
              <h3 className="text-sm font-bold whitespace-nowrap">LV</h3>
              <div className="flex items-center justify-center gap-0.5">
                {/* ▼ button */}
                <button
                  type="button"
                  className="px-0.5 text-yellow-300 disabled:text-gray-500 focus:outline-none"
                  style={{ fontSize: '1.2em', lineHeight: 1 }}
                  onClick={() => setStartLevel((prev) => Math.max(1, prev - 1))}
                  disabled={gameStarted || startLevel <= 1}
                  aria-label="Decrease level"
                >
                  ▼
                </button>
                {/* Level number */}
                <p className="text-lg font-mono text-yellow-400 whitespace-nowrap min-w-0 px-0 select-none">
                  {gameStarted ? level : startLevel}
                </p>
                {/* ▲ button */}
                <button
                  type="button"
                  className="px-0.5 text-yellow-300 disabled:text-gray-500 focus:outline-none"
                  style={{ fontSize: '1.2em', lineHeight: 1 }}
                  onClick={() => setStartLevel((prev) => Math.min(30, prev + 1))}
                  disabled={gameStarted || startLevel >= 30}
                  aria-label="Increase level"
                >
                  ▲
                </button>
              </div>
            </div>
            <div className="bg-gray-800 p-1 rounded text-center mb-0">
              <h3 className="text-sm font-bold whitespace-nowrap">Lines</h3>
              <p className="text-lg font-mono text-green-400 whitespace-nowrap">{lines}</p>
            </div>
          </div>
          
          <div className="space-y-2">
            {!gameStarted && (
              <>
                <button
                  onClick={startGame}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold whitespace-nowrap"
                >
                  Start
                </button>
                {/* ROT 버튼을 Start 아래에 항상 표시 */}
                <button
                  onClick={handleRotate}
                  className="w-full h-16 bg-blue-600 hover:bg-blue-700 rounded font-bold whitespace-nowrap mt-2"
                  disabled={!gameStarted || gameOver}
                >
                  Rotate
                </button>
              </>
            )}
            {gameStarted && !gameOver && (
              <>
                <button
                  onClick={togglePause}
                  className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-bold whitespace-nowrap"
                >
                  {isPaused ? 'GoGo' : 'Pause'}
                </button>
                {/* ROT 버튼을 Pause/GoGo 아래에도 항상 표시 */}
                <button
                  onClick={handleRotate}
                  className="w-full h-16 bg-blue-600 hover:bg-blue-700 rounded font-bold whitespace-nowrap mt-2"
                  disabled={!gameStarted || gameOver || isPaused}
                >
                  Rotate
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* dummy for tailwind purge */}
      <div className="hidden border-cyan-600 border-blue-500 from-cyan-600 to-cyan-300 from-blue-600 to-blue-300"></div>
      {isShortMobile ? (
        <>
          {/* Mobile controls */}
          <div className="mt-2 w-full max-w-sm">
            <div className="grid grid-cols-3 gap-3">
              {/* Left movement */}
              <button
                style={{ userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none', touchAction: 'none' }}
                onClick={() => movePiece(-1, 0, true)}
                className="col-span-1 h-16 w-24 ml-4 bg-gray-600 hover:bg-gray-700 active:bg-gray-800 rounded-lg font-bold text-xl flex items-center justify-center touch-manipulation whitespace-nowrap justify-self-start"
                disabled={!gameStarted || gameOver || isPaused}
              >
                ←
              </button>
              {/* Right movement */}
              <button
                style={{ userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none', touchAction: 'none' }}
                onClick={() => movePiece(1, 0, true)}
                className="col-span-1 h-16 w-24 bg-gray-600 hover:bg-gray-700 active:bg-gray-800 rounded-lg font-bold text-xl flex items-center justify-center touch-manipulation whitespace-nowrap"
                disabled={!gameStarted || gameOver || isPaused}
              >
                →
              </button>
              {/* DROP만 세로 배치 */}
              <div className="flex flex-col gap-2 col-span-1">
                <button
                  style={{ userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none', touchAction: 'none' }}
                  onClick={dropPiece}
                  className="h-16 bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg font-bold text-xl flex items-center justify-center touch-manipulation whitespace-nowrap"
                  disabled={!gameStarted || gameOver || isPaused}
                >
                  Drop
                </button>
              </div>
            </div>
          </div>
          {/* Fixed bottom ad */}
          <div className="fixed bottom-0 left-0 w-full flex justify-center z-50">
            <div ref={bottomAdRef} className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl" style={{ minHeight: 50 }} />
          </div>
        </>
      ) : (
        <>
          {/* Mobile controls */}
          <div className="mt-2 w-full max-w-sm">
            <div className="grid grid-cols-3 gap-3">
              {/* Left movement */}
              <button
                style={{ userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none', touchAction: 'none' }}
                onClick={() => movePiece(-1, 0, true)}
                className="col-span-1 h-16 w-24 bg-gray-600 hover:bg-gray-700 active:bg-gray-800 rounded-lg font-bold text-xl flex items-center justify-center touch-manipulation whitespace-nowrap justify-self-start"
                disabled={!gameStarted || gameOver || isPaused}
              >
                ←
              </button>
              {/* Right movement */}
              <button
                style={{ userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none', touchAction: 'none' }}
                onClick={() => movePiece(1, 0, true)}
                className="col-span-1 h-16 w-24 bg-gray-600 hover:bg-gray-700 active:bg-gray-800 rounded-lg font-bold text-xl flex items-center justify-center touch-manipulation whitespace-nowrap"
                disabled={!gameStarted || gameOver || isPaused}
              >
                →
              </button>
              {/* DROP만 세로 배치 */}
              <div className="flex flex-col gap-2 col-span-1">
                <button
                  style={{ userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none', touchAction: 'none' }}
                  onClick={dropPiece}
                  className="h-16 w-11/12 bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg font-bold text-xl flex items-center justify-center touch-manipulation whitespace-nowrap"
                  disabled={!gameStarted || gameOver || isPaused}
                >
                  Drop
                </button>
              </div>
            </div>
          </div>
          {/* Fixed bottom ad */}
          <div className="fixed bottom-0 left-0 w-full flex justify-center z-50">
            <div ref={bottomAdRef} className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl" style={{ minHeight: 50 }} />
          </div>
        </>
      )}
    </div>
  );
}






