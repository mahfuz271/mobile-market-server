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
        const productCollection = client.db('mobilemarket').collection('products');
        const wishlistCollection = client.db('mobilemarket').collection('wishlist');
        const orderCollection = client.db('mobilemarket').collection('orders');
        const paymentsCollection = client.db('mobilemarket').collection('payments');

        app.post('/create-payment-intent', async (req, res) => {
            const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
            const o = req.body;
            const price = o.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.orderId
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: 'Paid',
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await orderCollection.updateOne(filter, updatedDoc)

            const query = { _id: ObjectId(payment.productId) }
            const updatedDoc2 = {
                $set: {
                    status: 'Sold'
                }
            }
            let a = await productCollection.updateOne(query, updatedDoc2);

            res.send(result);
        })

        app.post('/jwtANDusers', async (req, res) => {
            const u = req.body;

            const query = { email: u.email };
            let user = await userCollection.findOne(query);
            if (!user && u?.insert) {
                delete u.insert;
                let status = await userCollection.insertOne(u);
                user = await userCollection.findOne(query);
            }
            if (user) {
                let token = jwt.sign({ email: u.email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
                let role = user.role;
                return res.send({ token, role });
            }
            res.send({})

        })



        //add or update
        app.post('/userVerify', verifyJWT, async (req, res) => {
            const s = req.body;
            const decoded = req.decoded;

            if (decoded.email !== req.query.email) {
                return res.status(403).send({ message: 'unauthorized access' })
            }

            const query = { _id: ObjectId(s._id) }
            delete s._id;
            const updatedDoc = {
                $set: s
            }
            let result = await userCollection.updateOne(query, updatedDoc);

            res.send(result);
        });

        app.post('/myproducts', verifyJWT, async (req, res) => {
            const s = req.body;
            let result;
            if (s._id == 'new') {
                delete s._id;
                s.created = new Date(Date.now());
                result = await productCollection.insertOne(s);
            } else {
                const query = { _id: ObjectId(s._id) }
                delete s._id;
                const updatedDoc = {
                    $set: s
                }
                result = await productCollection.updateOne(query, updatedDoc);

            }
            res.send(result);
        });

        app.delete('/myproducts/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await productCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/myproducts', verifyJWT, async (req, res) => {
            const decoded = req.decoded;

            if (decoded.email !== req.query.email) {
                return res.status(403).send({ message: 'unauthorized access' })
            }

            let query = {};
            if (req.query.email) {
                query = {
                    email: req.query.email
                }
            }
            const cursor = productCollection.find(query).sort({ created: -1 }, function (err, cursor) { })
            const c = await cursor.toArray();
            res.send(c);
        });

        app.get('/products', async (req, res) => {
            const query = { status: { $ne: "Sold" } }
            if (req.query.brand) {
                query.brand = req.query.brand
            }
            if (req.query.location) {
                query.location = req.query.location
            }
            if (req.query.advertise) {
                query.advertise = "Yes"
            }
            const limit = parseInt(req.query?.limit);
            const cursor = productCollection.find(query).sort({ created: -1 }, function (err, cursor) { })
            if (limit > 0) {
                cursor.limit(limit);
            }
            const s = await cursor.toArray();
            res.send(s);
        });

        app.get('/products/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const decoded = req.decoded;
            const query = { _id: ObjectId(id) };
            let s = await productCollection.findOne(query);
            if (s) {
                const query2 = { email: s.email };
                const u = await userCollection.findOne(query2);
                s.user = u;
            }
            const query3 = { email: decoded.email, pid: id };
            const w = await wishlistCollection.countDocuments(query3);
            s.wishlist = w;
            res.send(s);
        });

        app.post('/placeOrder', verifyJWT, async (req, res) => {
            let s = req.body;
            const decoded = req.decoded;
            const query = { pid: s.pid }
            const exist = await orderCollection.countDocuments(query);
            if (exist > 0) {
                return res.send({});
            }
            let result;
            s.email = decoded.email;
            s.created = new Date(Date.now());
            result = await orderCollection.insertOne(s);
            res.send(result);
        });

        app.post('/wishlist', verifyJWT, async (req, res) => {
            let s = req.body;
            const decoded = req.decoded;
            let result;
            if (s.task == 'added') {
                delete s.task;
                s.email = decoded.email;
                s.created = new Date(Date.now());
                result = await wishlistCollection.insertOne(s);
            } else {
                const query = { email: decoded.email, pid: s.pid }
                result = await wishlistCollection.deleteOne(query);

            }
            res.send(result);
        });

        app.get('/MyOrders', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            let query = {
                email: decoded.email
            }
            const cursor = orderCollection.find(query).sort({ created: -1 }, function (err, cursor) { })
            const c = await cursor.toArray();
            res.send(c);
        });

        app.post('/getRole', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            let query = {
                email: decoded.email
            }
            const c = await userCollection.findOne(query)
            res.send({ role: c.role });
        });

        app.get('/wishlist', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            let query = {
                email: decoded.email
            }
            const cursor = wishlistCollection.find(query).sort({ created: -1 }, function (err, cursor) { })
            const c = await cursor.toArray();
            res.send(c);
        });

        app.get('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const decoded = req.decoded;
            let query = {
                email: decoded.email
            }
            query._id = ObjectId(id);
            const result = await orderCollection.findOne(query);
            res.send(result);
        })

        app.delete('/users/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/users', verifyJWT, async (req, res) => {
            let query = {};
            if (req.query.role) {
                query = {
                    role: req.query.role
                }
            }
            const cursor = userCollection.find(query)
            const c = await cursor.toArray();
            res.send(c);
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