import express from 'express';
import { GoogleGenAI } from '@google/generative-ai';
import nodemailer from 'nodemailer';
import cron from 'node-cron';
import cors from 'cors';
import 'dotenv/config';

const app = express();
app.use(express.json());
app.use(cors());

// 1. Inicializar la IA de Google (Usando tu API Key de AI Studio)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Lista temporal de correos (Lo ideal a futuro es una base de datos o Google Sheets)
let suscriptores = [];

// 2. Ruta para recibir los correos desde el HTML de Ecoglow
app.post('/api/subscribe', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Falta el email' });
    
    if (!suscriptores.includes(email)) {
        suscriptores.push(email);
    }
    return res.json({ success: true, message: '¡Suscripción exitosa!' });
});

// 3. Función que recolecta info, genera el boletín y lo envía
async function enviarBoletinSemanal() {
    if (suscriptores.length === 0) return;

    try {
        // Podés usar una API de noticias o darle fuentes fijas en el Prompt
        const modelo = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `
            Sos un redactor experto de la página web que promociona productos naturales llamada Ecoglow. 
            Investigá internamente o usá tus conocimientos actualizados a 2026 para escribir un boletín informativo.
            Debe incluir:
            1. Un lanzamiento reciente o tendencia en cosmética limpia (libre de químicos).
            2. Un tip botánico aplicado a la estética de la piel (ej. propiedades de plantas).
            El tono debe ser amigable, consciente y muy estético. Escribilo en formato HTML limpio para el cuerpo del mail.
        `;

        const resultado = await modelo.generateContent(prompt);
        const contenidoBoletinHTML = resultado.response.text();

        // 4. Configurar el envío con Gmail (Nodemailer)
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_EMISOR, // Tu cuenta de Gmail de Ecoglow
                pass: process.env.EMAIL_PASSWORD  // Tu contraseña de aplicación de Google
            }
        });

        // Enviar a cada suscriptor
        for (const correo of suscriptores) {
            await transporter.sendMail({
                from: '"Ecoglow — Belleza Consciente" <tu-email@gmail.com>',
                to: correo,
                subject: "🌿 Tu dosis semanal de botánica y cosmética limpia",
                html: contenidoBoletinHTML
            });
        }
        console.log("¡Boletines enviados con éxito!");

    } catch (error) {
        console.error("Error al procesar el boletín:", error);
    }
}

// 5. PROGRAMACIÓN AUTOMÁTICA (CRON JOB)
// Configurado para ejecutarse todos los lunes a las 9:00 AM automáticamente
cron.schedule('0 9 * * 1', () => {
    console.log("Iniciando envío automático del boletín...");
    enviarBoletinSemanal();
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor Ecoglow corriendo en puerto ${PORT}`));
