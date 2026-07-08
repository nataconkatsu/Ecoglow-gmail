import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MongoClient } from 'mongodb';
import cron from 'node-cron';
import cors from 'cors';
import fetch from 'node-fetch'; // Cambiamos Resend por fetch para hablar con EmailJS
import 'dotenv/config';

const app = express();
app.use(express.json());
app.use(cors());

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const client = new MongoClient(process.env.MONGO_URI);
let db, suscriptoresColeccion;

async function conectarBaseDeDatos() {
    try {
        await client.connect();
        db = client.db('ecoglow_database');
        suscriptoresColeccion = db.collection('suscriptores');
        console.log("¡Conectado con éxito a MongoDB Atlas! 🚀");
    } catch (error) {
        console.error("Error al conectar a MongoDB:", error);
    }
}
conectarBaseDeDatos();

// Ruta para recibir los correos desde el HTML de Ecoglow
app.post('/api/subscribe', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Falta el email' });
    
    try {
        const existe = await suscriptoresColeccion.findOne({ email: email });
        if (!existe) {
            await suscriptoresColeccion.insertOne({ email: email, fecha: new Date() });
            console.log(`Nuevo suscriptor guardado: ${email}`);
        }
        return res.json({ success: true, message: '¡Suscripción exitosa!' });
    } catch (error) {
        return res.status(500).json({ error: 'Error al guardar en la base de datos' });
    }
});

// RUTA DE PRUEBA: Fuerza el envío inmediato
app.get('/api/test-boletin', async (req, res) => {
    console.log("Forzando envío de boletín con EmailJS...");
    try {
        await enviarBoletinSemanal();
        return res.json({ success: true, message: `Proceso ejecutado con EmailJS.` });
    } catch (error) {
        return res.status(500).json({ error: "Falló la prueba", detalles: error.message });
    }
});

// Función que genera el boletín y lo envía usando la API de EmailJS
async function enviarBoletinSemanal() {
    try {
        const listaSuscriptores = await suscriptoresColeccion.find({}).toArray();

        if (listaSuscriptores.length === 0) {
            console.log("No hay suscriptores en la base de datos.");
            return;
        }

        const modelo = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const prompt = `
            Sos un redactor experto de la página web que promociona productos naturales llamada Ecoglow. 
            Investigá internamente o usá tus conocimientos actualizados a 2026 para escribir un boletín informativo.
            Debe incluir:
            1. Un lanzamiento reciente o tendencia en cosmética limpia (libre de químicos).
            2. Un tip botánico aplicado a la estética de la piel (ej. propiedades de plantas).
            El tono debe ser amigable, consciente y muy estético. Escribilo en formato HTML limpio para el cuerpo del mail (usa etiquetas como <p>, <h3>, <ul>, etc.). No agregues bloques de código markdown como \`\`\`html.
        `;

        const resultado = await modelo.generateContent(prompt);
        const response = await resultado.response;
        const contenidoBoletinHTML = response.text();

        // Enviar los correos uno por uno a través de EmailJS
        for (const usuario of listaSuscriptores) {
            const dataEnvio = {
                service_id: process.env.EMAILJS_SERVICE_ID,
                template_id: process.env.EMAILJS_TEMPLATE_ID,
                user_id: process.env.EMAILJS_PUBLIC_KEY,
                template_params: {
                    to_email: usuario.email,       // El mail del cliente que lee de MongoDB
                    message: contenidoBoletinHTML  // El boletín estético generado por Gemini
                }
            };

            const respuestaEmailJS = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataEnvio)
            });

            if (respuestaEmailJS.ok) {
                console.log(`Mail enviado con éxito vía EmailJS a ${usuario.email}`);
            } else {
                const textoError = await respuestaEmailJS.text();
                console.error(`Error de EmailJS para ${usuario.email}:`, textoError);
            }
        }

    } catch (error) {
        console.error("Error al procesar el boletín:", error);
        throw error; 
    }
}

// PROGRAMACIÓN AUTOMÁTICA (Cada lunes a las 9:00 AM)
cron.schedule('0 9 * * 1', () => {
    console.log("Iniciando envío automático...");
    enviarBoletinSemanal();
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor Ecoglow corriendo en puerto ${PORT}`));
