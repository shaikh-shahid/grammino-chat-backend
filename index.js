const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const app = express();
const router = express.Router();
const entityNode = require("./entityConfig");
const db = require("./db");
global.entityNode = entityNode;
global.io = require("socket.io").listen(7777);

var storage = multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, "./uploads");
  },
  filename: function (req, file, callback) {
    callback(null, Date.now() + "-" + file.originalname);
  },
});

var upload = multer({ storage: storage }).single("userPhoto");
var userProfileUpload = multer({ storage: storage }).single("userProfilePhoto");

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, x-access-token"
  );
  if (req.method === "OPTIONS") {
    res.send("ok");
  } else {
    next();
  }
});

io.sockets.on("connection", function (socket) {
  socket.on("join", function (data) {
    socket.join(data.phone); // We are using room of socket io
  });
});

var secret = "4hKRFhSFBWHaZT3zwDFE";
// add the middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// routers

app.get("/ping", async (req, res) => {
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
    return res.json({
      error: true,
      message: "User already exists. Please login",
    });
  } else {
    // verify the payload
    let response = await db.addUser(data);
    if (response.error) {
      return res.json({ error: true, message: "Error adding user." });
    }
    let resp = {
      userId: response.data.userId,
      phone: response.data.phone,
      name: response.data.name,
    };
    var token = jwt.sign(resp, secret, {
      expiresIn: "365d", // never expires token
    });
    res.json({
      error: false,
      message: "User added.",
      hash: response.hash,
      token: token,
      userData: response.data,
    });
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
    name: response.data.name,
  };
  var token = jwt.sign(resp, secret, {
    expiresIn: "365d", // never expires token
  });

  res.json({
    error: false,
    message: "User logged in.",
    token: token,
    data: response.data,
  });
});

app.post("/network/message", async (req, res) => {
  if (req.body.type === "text") {
    let data = req.body;
    let response = await db.createChat(data);
    if (response.error) {
      return res.json({
        error: true,
        message: "error occurred while creating chat",
      });
    }
    console.log("Will emit event now", response.data, global.io.emit);
    global.io.emit("new_network_msg", { msg: response.data });
    res.json({
      error: false,
      message: "Success",
      data: response.data,
    });
  } else {
    upload(req, res, async (err) => {
      if (err) {
        console.log(err);
        return res.json({
          error: true,
          message: "error occurred while sending message",
        });
      }
      let data = req.body;
      data.filePath = req.file.path;
      console.log(data);
      let response = await db.createChat(data);
      if (response.error) {
        return res.json({
          error: true,
          message: "error occurred while creating chat",
        });
      }
      data.ipfsPath = response.data.ipfsPath;
      global.io.emit("new_network_msg", { msg: response.data });
      res.json({
        error: false,
        message: "Success",
        data: response.data,
      });
    });
  }
});

/**
 * Entity communication routes
 */

router.post("/entity", async (req, res) => {
  let data = req.body;
  let response = await db.createEntity(data);
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while creating entity",
    });
  }
  res.json({
    error: false,
    message: "Success",
    data: response.data,
  });
});

router.get("/entity", async (req, res) => {
  let response = await db.listEntity();
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while creating entity",
    });
  }
  res.json({
    error: false,
    message: "Success",
    data: response.data,
  });
});

router.post("/entity/communication", async (req, res) => {
  let data = req.body;
  let response = await db.createEntityCommunication(data);
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while creating entity",
    });
  }
  res.json({
    error: false,
    message: "Success",
    data: response.data,
  });
});

router.post("/entity/communication/list", async (req, res) => {
  let data = req.body;
  let response = await db.listEntityCommunication(data);
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while creating entity",
    });
  }
  res.json({
    error: false,
    message: "Success",
    data: response.data,
  });
});

router.post("/updateContacts", async (req, res) => {
  let data = req.body;
  let response = await db.crossCheckContacts(data.phoneNumbers);
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while checking contact",
    });
  }

  res.json({
    error: false,
    message: "Success",
    data: response.data,
  });
});

router.get("/conversation/recent", async (req, res) => {
  let data = req.decoded;
  let response = await db.getRecentConversation({ sender: data.phone });
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while checking contact",
    });
  }
  res.json({
    error: false,
    message: "Success",
    data: response.data,
  });
});

router.get("/conversation/:id", async (req, res) => {
  let senderInfo = req.decoded;
  let response = await db.getConversation({
    id: req.params.id,
    sender: senderInfo.phone,
  });
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while checking contact",
    });
  }
  res.json({
    error: false,
    message: "Success",
    data: response.data,
  });
});

router.post("/conversation", async (req, res) => {
  let data = {
    sender: req.decoded.phone,
    reciever: req.body.reciever,
  };
  let response = await db.createConversation(data);
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while creating conversation",
    });
  }
  console.log("Emitting new conversation", response.data);
  global.io.emit("new_conversation", { conversation: response.data });

  res.json({
    error: false,
    message: "Success",
    data: response.data,
  });
});

router.post("/chat", async (req, res) => {
  let data = req.body;
  if (data.type === "text") {
    let response = await db.createChat(data);
    if (response.error) {
      return res.json({
        error: true,
        message: "error occurred while creating chat",
      });
    }
    // emit socket message
    data.body = data.message;
    data.time = Date.now();
    data._id = response.data._id;
    global.io.sockets.in(data.reciever).emit("new_msg", { msg: data });
    // send response
    res.json({
      error: false,
      message: "Success",
      data,
    });
  } else {
    upload(req, res, async (err) => {
      console.log("Err", err);
      if (err) {
        return res.json({
          error: true,
          message: "error occurred while sending message",
        });
      }
      let data = req.body;
      data.filePath = req.file.path;
      let response = await db.createChat(data);
      if (response.error) {
        return res.json({
          error: true,
          message: "error occurred while creating chat",
        });
      }
      data.ipfsPath = response.data.ipfsPath;
      global.io.sockets.in(data.reciever).emit("new_msg", { msg: data });
      console.log("Data", data);
      res.json({
        error: false,
        message: "Success",
        data: data,
      });
    });
  }
});

router.post("/chat/recent", async (req, res) => {
  let data = {
    sender: req.decoded.phone,
    conversationId: req.body.conversationId,
  };
  let response = await db.getRecentChat(data);
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while fetching chat",
    });
  }
  res.json({
    error: false,
    message: "Success",
    data: response.data,
  });
});

router.post("/user/profile", async (req, res) => {
  userProfileUpload(req, res, async (err) => {
    if (err) {
      return res.json({
        error: true,
        message: "error uploading profile photo",
      });
    }
    let payload = {};
    payload.phone = req.body.phone;
    if (req.file) {
      payload.path = req.file.path;
    }
    payload.name = req.body.name;
    payload.status = req.body.status;
    let response = await db.updateUserInfo(payload);
    if (response.error) {
      return res.json({
        error: true,
        message: "error occurred while updating user profile information",
      });
    }
    res.json({
      error: false,
      message: "Success",
      data: [],
    });
  });
});

router.get("/user/profile", async (req, res) => {
  let userPhone = req.decoded.phone;
  let response = await db.getUserInfo(userPhone);
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while updating user profile information",
    });
  }
  res.json({
    error: false,
    message: "Success",
    data: response,
  });
});

/**
 * Network stuff
 */

router.get("/network/data", async (req, res) => {
  let response = await db.getNetworkMessage();
  if (response.error) {
    return res.json({
      error: true,
      message: "error occurred while getting network messages",
    });
  }
  res.json({
    error: false,
    message: "Success",
    data: response,
  });
});

/**
 * Logout the user
 */

app.get("/logout", (req, res) => {
  res.send("ok");
});

app.use(require("./tokenValidator")); //middleware to authenticate token
app.use("/api", router);

// global error handler
app.use(function (err, req, res, next) {
  console.log("Error happens", err.stack);
});

app.listen(process.env.PORT || 3000);
console.log("Listening on " + (process.env.PORT || 3000) + " port");
