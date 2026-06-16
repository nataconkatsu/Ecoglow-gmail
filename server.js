import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai'; // ¡Corregido aquí!
import nodemailer from 'nodemailer';
import cron from 'node-cron';
import cors from 'cors';
import 'dotenv/config';

const app = express();
app.use(express.json());
app.use(cors());

// 1. Inicializar la IA de Google usando la clase correcta
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // ¡Corregido aquí!

// Lista temporal de correos (Se borra si el servidor se reinicia; ideal usar Base de Datos a futuro)
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
        // Esperamos la respuesta del texto correctamente
        const response = await
