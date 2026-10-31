/* Twin Queens — interface strings (RU / EN) */
var TQ_I18N={
  ru:{
    title:'Twin Queens Chess — новые шахматы 9×8',
    play:'Играть',playPc:'Играть с компьютером',playFriend:'Играть вдвоём',
    rules:'Правила',download:'Скачать для Android',home:'Главная',
    opponent:'Соперник',computer:'Компьютер',friend:'Друг (на одном экране)',
    yourColor:'Ваш цвет',white:'Белые',black:'Чёрные',random:'Случайно',
    level:'Уровень',levels:['Новичок','Любитель','Сильный','Мастер'],
    time:'Контроль',noClock:'Без часов',min:'мин',
    undo:'Отменить',flip:'Перевернуть',newGame:'Новая партия',
    you:'Вы',yourMove:'Ваш ход',pcMove:'Ход компьютера',moveOf:{w:'Ход белых',b:'Ход чёрных'},check:' — шах!',
    movesHint:'Ходы появятся здесь. Перетащите фигуру или нажмите на неё, затем на поле.',
    promo:'Превращение',promoSub:'Выберите фигуру',again:'Ещё партию',view:'Смотреть доску',
    mate:'Мат',stalemate:'Пат',draw:'Ничья',timeout:'Время вышло',
    won:{w:'Белые победили',b:'Чёрные победили'},wonTime:{w:'Белые победили по времени',b:'Чёрные победили по времени'},
    noMoves:{w:'Белым некуда ходить — ничья',b:'Чёрным некуда ходить — ничья'},
    fifty:'Правило 50 ходов',threefold:'Троекратное повторение позиции',material:'Недостаточно материала для мата',
    settings:'Настройки',lang:'English',
    resign:'Сдаться',offerDraw:'Ничья',sure:'Точно?',resignT:'Сдача',agreed:'Ничья по соглашению',
    copyPgn:'Копировать PGN',downloadPgn:'Скачать PGN',copied:'PGN скопирован',
    sound:'Звук',dests:'Подсказывать ходы',anim:'Анимация',autoQueen:'Сразу в ферзя',coords:'Координаты',
    first:'В начало',prev:'Назад',next:'Вперёд',last:'К последнему ходу',premove:'Предход',soon:'скоро'
  },
  en:{
    title:'Twin Queens Chess — new chess on a 9×8 board',
    play:'Play',playPc:'Play the computer',playFriend:'Play a friend',
    rules:'Rules',download:'Download for Android',home:'Home',
    opponent:'Opponent',computer:'Computer',friend:'Friend (same screen)',
    yourColor:'Your colour',white:'White',black:'Black',random:'Random',
    level:'Level',levels:['Beginner','Casual','Strong','Master'],
    time:'Time control',noClock:'No clock',min:'min',
    undo:'Undo',flip:'Flip',newGame:'New game',
    you:'You',yourMove:'Your move',pcMove:'Computer is thinking',moveOf:{w:'White to move',b:'Black to move'},check:' — check!',
    movesHint:'Moves appear here. Drag a piece, or tap it and then a square.',
    promo:'Promotion',promoSub:'Choose a piece',again:'Play again',view:'View board',
    mate:'Checkmate',stalemate:'Stalemate',draw:'Draw',timeout:'Time out',
    won:{w:'White wins',b:'Black wins'},wonTime:{w:'White wins on time',b:'Black wins on time'},
    noMoves:{w:'White has no legal moves — draw',b:'Black has no legal moves — draw'},
    fifty:'50-move rule',threefold:'Threefold repetition',material:'Insufficient material',
    settings:'Settings',lang:'Русский',
    resign:'Resign',offerDraw:'Draw',sure:'Sure?',resignT:'Resignation',agreed:'Draw by agreement',
    copyPgn:'Copy PGN',downloadPgn:'Download PGN',copied:'PGN copied',
    sound:'Sound',dests:'Show legal moves',anim:'Animation',autoQueen:'Auto-queen',coords:'Coordinates',
    first:'First move',prev:'Back',next:'Forward',last:'Last move',premove:'Premove',soon:'soon'
  }
};
function tqLang(){
  var l=null;try{l=localStorage.getItem('tq-lang')}catch(e){}
  if(l!=='ru'&&l!=='en')l=/^(ru|uk|be|kk)/i.test(navigator.language||'')?'ru':'en';
  return l;
}
function tqSetLang(l){try{localStorage.setItem('tq-lang',l)}catch(e){}}
