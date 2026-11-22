# BoliviaSabe

*Entre bolivianos nos ayudamos.*

BoliviaSabe es la guía viva de tu ciudad. Los vecinos suben la foto de un **letrero** (un precio, una oferta, un servicio) o hacen una **pregunta** en «¿Alguien sabe?», y otros vecinos responden. Cuando una respuesta sirve, quien ayudó gana **yapitas**, un activo propio en la red de pruebas de Stellar, y cada premio queda registrado con un enlace público que cualquiera puede verificar.

Hecha por **CodeBambinos** para el hackathon National Startups by Stellar 2026. Todo corre en la **red de pruebas** de Stellar: no hay dinero real.

## El problema

En Bolivia, para saber dónde hay almuerzo barato, quién repara una laptop o si hay agua, la gente pregunta en grupos de WhatsApp y Facebook. Solo en Cochabamba hay al menos 20 grupos públicos «¿Alguien sabe?» en Facebook; el mayor, [«¿Alguien Sabe? - Cochabamba»](https://www.facebook.com/groups/alguien.sabe.cbba/), tiene 209 mil miembros y más de 90 publicaciones al día, y el de la UMSS, 15 mil. Hay grupos así en 8 de los 9 departamentos. Pasa todos los días y lo vivimos en Cochabamba: preguntamos en cinco grupos y la respuesta llega tarde o nunca, se pierde entre cientos de mensajes y nadie sabe si un precio sigue vigente. Quien sabe no gana nada por ayudar y calla. Los más afectados son estudiantes y vecinos con poco presupuesto, y los negocios de barrio que nadie encuentra.

**Cómo lo resuelve BoliviaSabe:** cada pregunta se comparte en grupos de WhatsApp con un enlace que abre la app y las urgentes salen primero 24 horas; todo queda por ciudad y zona y se busca por texto; cada letrero muestra su fecha y lo viejo avisa que puede estar desactualizado; y quien ayuda gana yapitas. A diferencia de WhatsApp y Facebook, ordena y premia; a diferencia de Marketplace y Google Maps, tiene datos del día y ayuda entre vecinos.

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

- **Activo `YAPITA`** emitido en testnet. Cada premio es un pago de la cuenta distribuidora a la persona; gastar es un pago de la persona a la distribuidora. Todos llevan un memo que dice de qué acción vienen (por ejemplo `letrero:5` o `ayuda:5`).
- **Una cuenta por vecino**, creada al terminar «Tu barrio»: se fondea con Friendbot, se le agrega la línea de confianza de YAPITA y recibe la bienvenida. Es una cuenta de prueba custodiada por la app: su clave se guarda cifrada (AES-256-GCM) y solo el servidor la usa.
- **El saldo es el de la cadena.** El navegador lo lee directamente de Horizon, no de nuestra base de datos.
- **Si Stellar falla, la persona no se queda sin hacer lo suyo.** Publicar, responder y calificar siguen funcionando y el premio queda pendiente hasta que se paga.

Para verificarlo:

| Cuenta | Dirección en el explorador |
|---|---|
| Emisora de YAPITA | [GDNTFTPY…YNLGW](https://stellar.expert/explorer/testnet/account/GDNTFTPY6D36V2OH4S2UTZ6OK6UW7PEGJZP7MIHY27JFKZDHUDFYNLGW) |
| Distribuidora (paga los premios) | [GDOSWRMZ…UHFEY](https://stellar.expert/explorer/testnet/account/GDOSWRMZMWPSDJ26YBSWUDF527QEXXXAIUAUAKFDAXXTY5QUMLUZHFEY) |

En la distribuidora se ven todos los pagos con su memo, y cada cuenta de usuario tiene el suyo.

## Qué construimos en este hackathon

Antes del hackathon no existía nada: empezamos de cero el **20 de noviembre**. Durante el hackathon armamos el prototipo visual, la wiki con las reglas del producto, una prueba del flujo de Stellar en testnet y todo el código de este repositorio. Cada cambio entró por pull request, con verificación de tipos y compilación automáticas.

- **Producto:** Hoy (letreros con foto, búsqueda y etiquetas), ¿Alguien sabe? (preguntas, urgentes, comentarios en tiempo real en cada respuesta, «Me sirvió»), Yo (saldo, movimientos con enlace al explorador, actividad, ajustes), contacto solo con permiso, notificaciones al celular, vista previa al compartir en WhatsApp y app instalable que muestra lo último visto sin señal.
- **Stellar:** activo YAPITA, una cuenta de prueba por vecino, un pago con memo por cada premio o gasto, reintentos si la red falla y `npm run stellar:reset` por si testnet se reinicia.
- **Datos y seguridad:** Postgres con permisos por fila y pruebas (`supabase/tests/rls.sql`), límites contra el abuso aplicados en la base y claves de Stellar cifradas, solo en el servidor.
- **Cómo trabajamos:** cada tarea tiene su especificación en `specs/` (qué entra, qué no, plan y criterios de aceptación) y su tarjeta en el tablero del equipo.
- **Lo que falta:** canje de yapitas con negocios, billeteras propias con Pollar y la red principal de Stellar (ver el plan).

## Cómo se sostiene

Para los vecinos es gratis: ver, publicar, responder y premiar. Marcar una pregunta como urgente cuesta 5 yapitas, que no son dinero.

Pagan los **negocios de barrio**: por **Bs 50 al mes** (precio a validar en el piloto), sus letreros salen primero en Hoy para los vecinos de su zona, con la marca «Destacado». Es menos que la inversión mínima que se suele recomendar para anuncios de Facebook y llega solo a vecinos de su zona. En el piloto se paga fuera de la app (QR o transferencia); más adelante, con Pollar.

Ese ingreso llena el fondo del **canje**: el vecino cambia sus yapitas por un descuento en un negocio aliado y va a ese negocio a usarlo. Así el negocio que paga recibe clientes. En la app nunca se muestran bolivianos: el vecino solo ve yapitas.

Cómo lo validamos: los 5 negocios del piloto tienen el primer mes gratis y al final se les pregunta si pagarían Bs 50; la meta del día 30 es que **3 negocios paguen**.

## Plan de 30 días

| Fechas | Objetivo | Qué hacemos | Cómo lo medimos |
|---|---|---|---|
| 23 al 29 nov | Piloto en Cochabamba | Aplicar lo que diga el jurado. Construir la marca «Destacado» para los letreros de negocios. Visitar 5 negocios de Cala Cala, Sarco y el Centro para que suban sus ofertas, y responder preguntas reales en los grupos «¿Alguien sabe?» de Cochabamba | 30 cuentas y 5 negocios con letreros |
| 30 nov al 13 dic | Confianza y crecer en Cochabamba | Confirmación de correo, verificación con terceros, normativa de datos y reglas de moderación; seguir respondiendo en los grupos y sumar negocios | 20 perfiles verificados |
| 14 al 22 dic | Siguientes implementaciones | Billeteras propias con Pollar, canje de yapitas con negocios aliados, paso a la red principal de Stellar y las primeras ciudades del eje troncal | 1 canje real y 3 negocios que pagan |

**Cómo llegamos a los primeros usuarios:** sin publicidad pagada. Respondemos preguntas reales en los grupos «¿Alguien sabe?» de Cochabamba y pedimos permiso a sus administradores para presentar la app (sus reglas prohíben la publicidad). En grupos de compra y venta como [«Cala Cala - Ciudad Cochabamba»](https://www.facebook.com/groups/calacala/) (633 miembros) compartimos letreros con su enlace. Antes cargamos letreros reales para que nadie encuentre la app vacía, y cada cuenta nueva recibe 5 yapitas de bienvenida.

**Metas al día 30:** 150 cuentas, 45 activas por semana y menos de 30 minutos hasta la primera respuesta.

## Equipo CodeBambinos

Tres jóvenes de Cochabamba: **Yaeko** (product owner: investigación, paleta de colores y prototipo), **Diego** (líder técnico: código, datos y Stellar) y **Aldrin** (desarrollador: pantallas e interfaz).

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

### Si Stellar reinicia testnet

Stellar borra testnet cada cierto tiempo. La base sigue intacta, pero en la red desaparecen la emisora, la distribuidora y las cuentas de los vecinos. Para recuperarlo todo:

```bash
npm run stellar:reset -- --dry-run   # muestra qué falta, sin escribir nada
npm run stellar:reset                # recrea emisora, distribuidora y cuentas con las mismas direcciones
                                     # y vuelve a pagar en orden cada yapita confirmada (mismo memo)
npm run stellar:e2e                  # comprueba el flujo completo
```

Las direcciones no cambian, así que Vercel no se toca. Si se corta, se corre de nuevo: termina lo que falta sin pagar nada dos veces. `--force` crea otra emisora aunque la actual exista. Es solo para probar con una copia del entorno (`--env-file .env.prueba` apuntando a la base local); en ese caso el script imprime los comandos para actualizar Vercel.
