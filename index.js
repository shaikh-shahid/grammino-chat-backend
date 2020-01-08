const express = require("express");
const bodyParser = require("body-parser");
const redis = require("redis");
const jwt = require('jsonwebtoken');
const multer = require('multer');
const app = express();
const client = redis.createClient();
const router = express.Router();
const db = require("./db");
var io = require('socket.io').listen(7777);

var storage =   multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, './uploads');
  },
  filename: function (req, file, callback) {
    callback(null, Date.now() + '-' +  file.originalname );
  }
});

var upload = multer({ storage : storage}).single('userPhoto');

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-access-token");
  if(req.method === 'OPTIONS') {
    res.send('ok');
  } else {
    next();
  }
});

io.sockets.on('connection', function (socket) {
  socket.on('join', function (data) {
    socket.join(data.phone); // We are using room of socket io
  });
});

app.use(express.static(__dirname + "/views/"));
app.use(express.static(__dirname + "/views/js"));
app.use(express.static(__dirname + "/views/css"));

var secret = '4hKRFhSFBWHaZT3zwDFE';
// add the middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// routers

app.get('/ping', async (req,res) => {
  return res.json({ error: false, message: "All good!" });
});

/**
 * Sign up, add new user
 */


app.post("/user", async (req, res) => {
  // add new user
  let data = req.body;
  //check if user already exists
  let existance = await db.checkUser(data);
  if (existance.error) {
    return res.json({ error: true, message: "User already exists. Please login" });
  } else {
    // verify the payload
    let response = await db.addUser(data);
    if (response.error) {
      return res.json({ error: true, message: "Error adding user." });
    }
    let resp = {
      userId: response.data.userId,
      phone: response.data.phone,
      name: response.data.name
    };
    var token = jwt.sign(resp,secret, {
        expiresIn: '365d' // never expires token
    });
    res.json({ error: false, message: "User added.", hash: response.hash, token: token, userData: response.data });
  }
});

/**
 * Login to the system
 */

app.post("/login", async (req, res) => {
    let data = req.body;
    let response = await db.login(data);
    if (response.error) {
      return res.json({ error: true, message: "Invalid user" });
    }
    // add session info here
    // set session
    let resp = {
      userId: response.data.userId,
      phone: response.data.phone,
      name: response.data.name
    };
    var token = jwt.sign(resp,secret, {
      expiresIn: '365d' // never expires token
    });

    res.json({
      error: false,
      message: "User logged in.",
      token: token,
      data: response.data
    });
});

router.post('/updateContacts', async (req,res) => {
  let data = req.body;
  let response = await db.crossCheckContacts(data.phoneNumbers);
  if (response.error) {
    return res.json({ error: true, message: "error occurred while checking contact" });
  }

  res.json({
    error: false,
    message: 'Success',
    data: response.data
  });
});

router.get('/conversation/recent', async (req,res) => {
  let data = req.decoded;
  let response = await db.getRecentConversation({sender: data.phone});
  if (response.error) {
    return res.json({ error: true, message: "error occurred while checking contact" });
  }  
  res.json({
    error: false,
    message: 'Success',
    data: response.data
  });  
});

router.get('/conversation/:id', async (req,res) => {
  let senderInfo = req.decoded;
  let response = await db.getConversation({id: req.params.id, sender: senderInfo.phone});
  if (response.error) {
    return res.json({ error: true, message: "error occurred while checking contact" });
  }  
  res.json({
    error: false,
    message: 'Success',
    data: response.data
  });  
});

router.post('/conversation', async(req,res) => {
    let data = {
      sender: req.decoded.phone,
      reciever: req.body.reciever
    };
    console.log(data)
    let response = await db.createConversation(data);
    if (response.error) {
      return res.json({ error: true, message: "error occurred while creating conversation" });
    }
    res.json({
      error: false,
      message: 'Success',
      data: response.data
    });  
});

router.post('/chat', async (req,res) => {  
  let data = req.body;
  if(data.type === 'text') {    
    let response = await db.createChat(data);
    if (response.error) {
      return res.json({ error: true, message: "error occurred while creating chat"});
    }
    // emit socket message
    data.body = data.message;
    data.time = Date.now();
    io.sockets.in(data.reciever).emit('new_msg', {msg: data});
  
    // send response
    res.json({
      error: false,
      message: 'Success',
      data: []
    });  
  } else {
    upload(req, res, async (err) => {
      if(err) {
        return res.json({ error: true, message: "error occurred while sending message"});
      }      
      let data = req.body;
      console.log(req.file);
      console.log(data);
      data.filePath = req.file.path;
      let response = await db.createChat(data);
      if (response.error) {
        return res.json({ error: true, message: "error occurred while creating chat"});
      }
      data.ipfsPath = response.data.ipfsPath;
      io.sockets.in(data.reciever).emit('new_msg', {msg: data});
      res.json({
        error: false,
        message: 'Success',
        data: data
      });
    }); 
  }
});

router.post('/chat/recent', async(req,res) => {
  let data = {
    sender: req.decoded.phone,
    conversationId: req.body.conversationId
  };  
  let response = await db.getRecentChat(data);
  if (response.error) {
    return res.json({ error: true, message: "error occurred while fetching chat"});
  }
  res.json({
    error: false,
    message: 'Success',
    data: response.data
  }); 
});

/**
 * Logout the user
 */

app.get("/logout", (req, res) => {
  res.send('ok');
});

app.use(require('./tokenValidator')); //middleware to authenticate token
app.use("/api", router);

app.listen(process.env.PORT || 3000);
console.log("Listening on " + (process.env.PORT || 3000) + " port");
