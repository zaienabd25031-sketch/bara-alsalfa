const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const rooms = {};

// المواضيع صارت بس أماكن (بدون أدوار)
const gameData = {
    'أماكن عامة': ['مستشفى', 'مدرسة', 'مول تجاري', 'قهوة (كوفي شوب)', 'سوق شعبي', 'متنزه', 'جامعة'],
    'دوائر حكومية': ['دائرة المرور', 'دائرة الجوازات', 'محكمة', 'مركز شرطة', 'دائرة التقاعد'],
    'رياضة وملاعب': ['ملعب طوبة', 'قاعة حديد (جيم)', 'مسبح أولمبي', 'ملعب خماسي'],
    'نقل ومواصلات': ['كراج العلاوي', 'مطار بغداد', 'محطة قطار', 'سيطرة أمنية'],
    'أكلات ومطاعم': ['مطعم باجة', 'عربانة كص', 'محل فلافل', 'مسمكة (أبو المسكوف)'],
    'أماكن تاريخية': ['بابل الأثرية', 'المتحف الوطني', 'زقورة أور', 'قلعة أربيل'],
    'مهن وحرف': ['ورشة تصليح (فيتر)', 'صالون حلاقة', 'محل صياغة', 'محل موبايلات'],
    'أكشن ومغامرات': ['سفينة قراصنة', 'قاعدة فضائية', 'غواصة', 'غابة استوائية']
};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ playerName, roomCode }) => {
        socket.join(roomCode);
        if (!rooms[roomCode]) {
            rooms[roomCode] = { players: [], hostId: socket.id, timer: null, votes: {}, spyId: null, spyName: null };
        }
        rooms[roomCode].players.push({ id: socket.id, name: playerName });
        io.to(roomCode).emit('updatePlayers', { players: rooms[roomCode].players, hostId: rooms[roomCode].hostId });
        socket.to(roomCode).emit('user-joined', socket.id);
    });

    socket.on('startGame', ({ roomCode, category, minutes }) => {
        const room = rooms[roomCode];
        if (room && room.players.length >= 3 && socket.id === room.hostId) {
            const places = gameData[category];
            const secretPlace = places[Math.floor(Math.random() * places.length)];
            
            const spyIndex = Math.floor(Math.random() * room.players.length);
            room.spyId = room.players[spyIndex].id;
            room.spyName = room.players[spyIndex].name;
            room.votes = {}; 

            room.players.forEach((player, index) => {
                if (index === spyIndex) {
                    io.to(player.id).emit('gameResult', { 
                        role: 'أنت برا السالفة! (الجاسوس) 🕵️‍♂️', 
                        place: 'اسمع زين وحاول تعرف السالفة من أسئلتهم!', 
                        allPlaces: places 
                    });
                } else {
                    io.to(player.id).emit('gameResult', { 
                        role: 'أنت داخل السالفة! 😎', 
                        place: `السالفة هي: ${secretPlace} 🤫`, 
                        allPlaces: places 
                    });
                }
            });

            let timeLeft = minutes * 60;
            clearInterval(room.timer);
            room.timer = setInterval(() => {
                timeLeft--;
                io.to(roomCode).emit('timerUpdate', timeLeft);
                if (timeLeft <= 0) {
                    clearInterval(room.timer);
                    io.to(roomCode).emit('startVoting', room.players);
                }
            }, 1000);
        }
    });

    socket.on('sendReaction', ({ roomCode, emoji }) => { io.to(roomCode).emit('receiveReaction', emoji); });

    socket.on('submitVote', ({ roomCode, targetId }) => {
        const room = rooms[roomCode];
        if (room) {
            room.votes[socket.id] = targetId;
            if (Object.keys(room.votes).length === room.players.length) {
                let spyVotes = 0;
                for (const voter in room.votes) { if (room.votes[voter] === room.spyId) spyVotes++; }
                const half = Math.ceil(room.players.length / 2);
                let winnerMsg = spyVotes >= half ? '🏆 فازوا ربعنا! كشفوا الجاسوس!' : '😈 فاز الجاسوس! عبرت عليكم وانهزم!';
                io.to(roomCode).emit('finalResult', { winnerMsg, spyName: room.spyName });
            }
        }
    });

    socket.on('resetGame', (roomCode) => {
        if (rooms[roomCode]) { clearInterval(rooms[roomCode].timer); io.to(roomCode).emit('goToLobby'); }
    });

    socket.on('webrtc-offer', (data) => { socket.to(data.target).emit('webrtc-offer', { sender: socket.id, sdp: data.sdp }); });
    socket.on('webrtc-answer', (data) => { socket.to(data.target).emit('webrtc-answer', { sender: socket.id, sdp: data.sdp }); });
    socket.on('webrtc-ice', (data) => { socket.to(data.target).emit('webrtc-ice', { sender: socket.id, candidate: data.candidate }); });

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                if (socket.id === room.hostId && room.players.length > 0) room.hostId = room.players[0].id;
                io.to(roomCode).emit('updatePlayers', { players: room.players, hostId: room.hostId });
            }
        }
    });
});

const socket = io('http://localhost:3000');
http.listen(PORT, () => { console.log(`الخادم يشتغل على بورت: ${PORT}`); });
