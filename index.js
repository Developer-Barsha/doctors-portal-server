const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

app.use(cors())
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.hnowq.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req?.headers?.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    });
}


async function run() {
    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: user
            };
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            res.send({ result, token });
        })

        /**
            * API Naming Convention
            * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
            * app.get('/booking/:id') // get a specific booking 
            * app.post('/booking') // add a new booking
            * app.patch('/booking/:id) // upsert ==> update (if exists) or insert (if doesn't exist)
            * app.delete('/booking/:id) //
        */

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
            const exists = await bookingCollection.findOne(query);

            if (exists) {
                return res.send({ seccess: false, booking: exists });
            }

            const bookings = await bookingCollection.insertOne(booking);
            return res.send({ success: true, bookings });
        })

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' })
            }
        })

        app.get('/booking', async (req, res) => {
            const query = {};
            const cursor = bookingCollection.find(query);
            const bookings = await cursor.toArray();
            res.send(bookings);
        })

        // WARNING :
        // this is not proper way to use query. After learning more mongodb use aggregate lookup, pipeline, match, group
        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // step 1: get all services
            const services = await servicesCollection.find().toArray();

            // step 2: get the booking of that date . output [{}, {}, {}, {}, {}....]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each service
            services.forEach(service => {
                // step 4: find bookings for that service . output [{}, {}, {}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);

                // step 5: select slots for the service bookings. output ['', '', '']
                const bookedSlots = serviceBookings.map(book => book.slot);

                // step 6: select those slots that are not in bookSlots 
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));

                // step 7: set avaiable t slots to make it easier
                service.slots = available;
            })

            res.send(services);
        })

        console.log('connected to db');
    }

    finally {

    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Running doctors portal server')
})

app.listen(port, () => {
    console.log('Doctors app listening on port', port);
})