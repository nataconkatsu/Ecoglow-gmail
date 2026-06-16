import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import nodemailer from 'nodemailer';
import cron from 'node-cron';
import cors from 'cors';
import 'dotenv/config';

const app = express();
app.use(express.json());
app.use(cors());

// 1. Inicializar la IA de Google usando la clase correcta
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Lista temporal de correos (Se borra si el servidor se reinicia)
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

// 🔥 NUEVA RUTA DE PRUEBA: Fuerza el envío del boletín inmediatamente al entrar desde el navegador
app.get('/api/test-boletin', async (req, res) => {
    console.log("Forzando envío de boletín de prueba desde la ruta web...");
    try {
        await enviarBoletinSemanal();
        return res.json({ 
            success: true, 
            message: `Proceso de envío ejecutado. Si tenías correos anotados (actualmente hay ${suscriptores.length}), revisá sus casillas y los logs de Render.` 
        });
    } catch (error) {
        return res.status(500).json({ error: "Falló la prueba del boletín", detalles: error.message });
    }
});

// 3. Función que recolecta info, genera el boletín y lo envía
async function enviarBoletinSemanal() {
    if (suscriptores.length === 0) {
        console.log("No hay suscriptores anotados todavía.");
        return;
    }

    try {
        const modelo = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
        
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

        // 4. Configurar el envío con Gmail (Nodemailer)
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_EMISOR, 
                pass: process.env.EMAIL_PASSWORD  
            }
        });

        // Enviar a cada suscriptor
        for (const correo of suscriptores) {
            await transporter.sendMail({
                from: `"Ecoglow — Belleza Consciente" <${process.env.EMAIL_EMISOR}>`, 
                to: correo,
                subject: "🌿 Tu dosis semanal de botánica y cosmética limpia",
                html: contenidoBoletinHTML
            });
        }
        console.log(`¡Boletines enviados con éxito a ${suscriptores.length} usuarios!`);

    } catch (error) {
        console.error("Error al procesar el boletín:", error);
        throw error; // Lanzamos el error para que la ruta de prueba lo capture si algo falla
    }
}

// 5. PROGRAMACIÓN AUTOMÁTICA (CRON JOB)
// Configurado para ejecutarse todos los lunes a las 9:00 AM automáticamente
cron.schedule('0 9 * * 1', () => {
    console.log("Iniciando envío automático del boletín...");
    enviarBoletinSemanal();
});

// 6. Encendido del servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor Ecoglow corriendo en puerto ${PORT}`));
