import express from 'express';
import cors from 'cors';
import photoRoutes from './routes/photoRoutes.js';

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

app.use('/api/photos', photoRoutes);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
