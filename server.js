import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Resend } from 'resend';
import { MongoClient } from 'mongodb'; // Importación correcta para ES Modules
import cron from 'node-cron';
import cors from 'cors';
import 'dotenv/config';

const app = express();
app.use(express.json());
app.use(cors());

// Inicializar la IA de Google y Resend
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// Conexión a MongoDB
const client = new MongoClient(process.env.MONGO_URI);
let db, suscriptoresColeccion;

async function conectarBaseDeDatos() {
    try {
        await client.connect();
        db = client.db('ecoglow_database'); // Nombre de tu base de datos
        suscriptoresColeccion = db.collection('suscriptores'); // Nombre de la colección
        console.log("¡Conectado con éxito a MongoDB Atlas! 🚀");
    } catch (error) {
        console.error("Error al conectar a MongoDB:", error);
    }
}
conectarBaseDeDatos();

// 2. Ruta para recibir los correos desde el HTML de Ecoglow (¡Ahora guarda en la Base de Datos!)
app.post('/api/subscribe', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Falta el email' });
    
    try {
        // Verifica si el email ya existe en la base de datos
        const existe = await suscriptoresColeccion.findOne({ email: email });
        
        if (!existe) {
            await suscriptoresColeccion.insertOne({ email: email, fecha: new Date() });
            console.log(`Nuevo suscriptor guardado: ${email}`);
        }
        
        return res.json({ success: true, message: '¡Suscripción exitosa y guardada!' });
    } catch (error) {
        return res.status(500).json({ error: 'Error al guardar en la base de datos' });
    }
});

// 🔥 RUTA DE PRUEBA: Fuerza el envío inmediato leyendo desde la Base de Datos
app.get('/api/test-boletin', async (req, res) => {
    console.log("Forzando envío de boletín de prueba leyendo desde MongoDB...");
    try {
        await enviarBoletinSemanal();
        return res.json({ 
            success: true, 
            message: `Proceso de envío ejecutado con los correos de la base de datos.` 
        });
    } catch (error) {
        return res.status(500).json({ error: "Falló la prueba", detalles: error.message });
    }
});

// 3. Función que recolecta info, genera el boletín y lo envía
async function enviarBoletinSemanal() {
    try {
        // Trae todos los suscriptores desde MongoDB
        const listaSuscriptores = await suscriptoresColeccion.find({}).toArray();

        if (listaSuscriptores.length === 0) {
            console.log("No hay suscriptores en la base de datos todavía.");
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

        // Enviar los correos usando Resend
        for (const usuario of listaSuscriptores) {
            const { data, error } = await resend.emails.send({
                from: 'Ecoglow <onboarding@resend.dev>',
                to: usuario.email, // Lee la propiedad 'email' guardada en Mongo
                subject: '🌿 Tu dosis semanal de botánica y cosmética limpia',
                html: contenidoBoletinHTML,
            });

            if (error) {
                console.error(`Error enviando a ${usuario.email}:`, error);
            } else {
                console.log(`Mail enviado con éxito a ${usuario.email}. ID: ${data.id}`);
            }
        }

    } catch (error) {
        console.error("Error al procesar el boletín:", error);
        throw error; 
    }
}

// 5. PROGRAMACIÓN AUTOMÁTICA (CRON JOB)
cron.schedule('0 9 * * 1', () => {
    console.log("Iniciando envío automático del boletín...");
    enviarBoletinSemanal();
});

// 6. Encendido del servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor Ecoglow corriendo en puerto ${PORT}`));
