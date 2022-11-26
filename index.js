const express = require('express')
const dotenv = require('dotenv')
var cors = require('cors')
const app = express()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json());
dotenv.config()

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DBV_USER}:${process.env.DB_PASSWORD}@cluster0.yzlpmea.mongodb.net/?retryWrites=true&w=majority`;

async function run() {
    try {
        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
        const userCollection = client.db('mobilemarket').collection('users');

        app.post('/jwt', async (req, res) => {
            const email = req.query.email;

            const query = { email: email };
            const user = await userCollection.findOne(query);
            console.log(user);
            if (user) {
                let token = jwt.sign({email}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
                let role = user.role;
                res.send({ token, role })

            }
            res.send({})
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const update = { $set: user };
            const query = { email: update.email };
            const options = { upsert: true };
            const result = await userCollection.updateOne(query, update, options);
            res.send(result);
        });
    }
    finally {

    }

}

app.get('/', (req, res) => {
    res.send('Server created for assignment 12 by Mahfuz.')
})

run().catch(err => console.error(err));

app.listen(port, () => {
    console.log(`Mobile Market server app listening on port ${port}`)
})