# BoliviaSabe

*Entre bolivianos nos ayudamos.*

BoliviaSabe es la guía viva de tu ciudad. Los vecinos suben la foto de un **letrero** (un precio, una oferta, un servicio) o hacen una **pregunta** en «¿Alguien sabe?», y otros vecinos responden. Cuando una respuesta sirve, quien ayudó gana **yapitas**, un activo propio en la red de pruebas de Stellar, y cada premio queda registrado con un enlace público que cualquiera puede verificar.

Hecha por **CodeBambinos** para el hackathon National Startups by Stellar 2026. Todo corre en la **red de pruebas** de Stellar: no hay dinero real.

## Pruébala

**https://boliviasabe.vercel.app**: está pensada para el celular y también funciona en computador.

1. **Mira sin registrarte.** La app abre directo en Hoy, con los letreros de Cochabamba. Puedes cambiar de ciudad arriba.
2. **Crea tu cuenta al participar.** Subir un letrero, preguntar, responder o dar «Me sirvió» te pide entrar. Usa Google o cualquier correo con una contraseña de 6 caracteres o más (no hace falta confirmar el correo).
3. **«Tu barrio».** La primera vez pide tu nombre, tu ciudad y tu zona. Después vuelves a lo que ibas a hacer.
4. **Tu cuenta Stellar.** En unos segundos aparece tu saldo: **5 yapitas de bienvenida**, pagadas desde la cuenta distribuidora de BoliviaSabe a la cuenta que se acaba de crear para ti.

## Cómo se ganan y se gastan las yapitas

| Acción | Yapitas |
|---|---|
| Crear tu cuenta | +5 |
| Subir un letrero con foto | +1 |
| Que a alguien le sirva tu letrero | +1 |
| Que quien preguntó marque «Me sirvió» en tu respuesta | +5 |
| Cerrar tu propia pregunta | +1 |
| Marcar una pregunta como urgente | −5 |

Hay topes contra el abuso (por ejemplo, 10 letreros con premio por día y 3 «Me sirvió» con premio por pregunta). Si una acción pasa un tope se hace igual, pero sin premio.

## Cómo usa Stellar

- **Activo `YAPITA`** emitido en testnet. Cada premio es un pago de la cuenta distribuidora a la persona; gastar es un pago de la persona a la distribuidora. Todos llevan un memo que dice de qué acción vienen (por ejemplo `ayuda:q123`).
- **Una cuenta por vecino**, creada al terminar «Tu barrio»: se fondea con Friendbot, se le agrega la línea de confianza de YAPITA y recibe la bienvenida. Es una cuenta de prueba custodiada por la app: su clave se guarda cifrada (AES-256-GCM) y solo el servidor la usa.
- **El saldo es el de la cadena.** El navegador lo lee directamente de Horizon, no de nuestra base de datos.
- **Si Stellar falla, la persona no se queda sin hacer lo suyo.** Publicar, responder y calificar siguen funcionando y el premio queda pendiente hasta que se paga.

Para verificarlo:

| Cuenta | Dirección en el explorador |
|---|---|
| Emisora de YAPITA | [GDNTFTPY…YNLGW](https://stellar.expert/explorer/testnet/account/GDNTFTPY6D36V2OH4S2UTZ6OK6UW7PEGJZP7MIHY27JFKZDHUDFYNLGW) |
| Distribuidora (paga los premios) | [GDOSWRMZ…UHFEY](https://stellar.expert/explorer/testnet/account/GDOSWRMZMWPSDJ26YBSWUDF527QEXXXAIUAUAKFDAXXTY5QUMLUZHFEY) |

En la distribuidora se ven todos los pagos con su memo, y cada cuenta de usuario tiene el suyo.

## Hecho con

Vite, React y TypeScript (como app instalable), Supabase (cuentas, base de datos con permisos por fila, fotos y tiempo real), funciones de Vercel para lo que firma en Stellar, y `@stellar/stellar-sdk` solo en el servidor.

## Correrla en tu computador

Necesitas Node 24.

```bash
npm install
npm run dev
```

Sin configurar nada corre con datos de ejemplo en memoria (se reinician al recargar). Para usar Supabase y Stellar de verdad:

```bash
cp .env.example .env     # completa los valores de Supabase
npm run stellar:setup    # crea la emisora y la distribuidora de prueba y emite YAPITA
npm run stellar:e2e      # comprueba el flujo completo en testnet: cuenta, +5, +5, −5 → saldo 5
npm run seed             # 5 vecinos de ejemplo con letreros y preguntas (contraseña: SEED_PASSWORD)
```

Las funciones `/api` solo corren en Vercel (o con `vercel dev`).
