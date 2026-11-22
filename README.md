# BoliviaSabe

*Entre bolivianos nos ayudamos.*

BoliviaSabe es la guía viva de tu ciudad. Los vecinos suben la foto de un **letrero** (un precio, una oferta, un servicio) o hacen una **pregunta** en «¿Alguien sabe?», y otros vecinos responden. Cuando una respuesta sirve, quien ayudó gana **yapitas**, un activo propio en la red de pruebas de Stellar, y cada premio queda registrado con un enlace público que cualquiera puede verificar.

Hecha por **CodeBambinos** para el hackathon National Startups by Stellar 2026. Todo corre en la **red de pruebas** de Stellar: no hay dinero real.

**Pitch deck (PDF):** https://drive.google.com/file/d/1c6a5ZMkokjHeDHesX-xzRb4C6Wp_vK6l/view?usp=sharing

## El problema

En Bolivia, para saber dónde hay almuerzo barato, quién repara una laptop o si hay agua, la gente pregunta en grupos de WhatsApp y Facebook. Solo en Cochabamba hay al menos 20 grupos públicos «¿Alguien sabe?» en Facebook; el mayor, [«¿Alguien Sabe? - Cochabamba»](https://www.facebook.com/groups/alguien.sabe.cbba/), tiene 209 mil miembros y más de 90 publicaciones al día, y el de la UMSS, 15 mil. Hay grupos así en 8 de los 9 departamentos. Pasa todos los días, y lo confirmamos con una encuesta (ver «Lo que nos dijeron 24 personas»): lo que más molesta no es que tarde, sino que **la pregunta se pierde** entre mensajes y que **nadie sabe si la información sigue vigente**. Quien sabe no gana nada por ayudar. Los más afectados son los estudiantes y los negocios de barrio que nadie encuentra.

**Cómo lo resuelve BoliviaSabe:** todo queda por ciudad y zona y se busca por texto, así nada se pierde; cada letrero muestra su fecha y lo viejo avisa que puede estar desactualizado; cada pregunta se comparte en grupos de WhatsApp con un enlace que abre la app y las urgentes salen primero 24 horas; y quien ayuda gana yapitas. A diferencia de WhatsApp y Facebook, ordena y premia; a diferencia de Marketplace y Google Maps, tiene datos del día y ayuda entre vecinos.

## Lo que nos dijeron 24 personas

Encuesta por WhatsApp a 24 personas de Cochabamba: 8 estudiantes, 11 vecinos y 5 dueños de negocio (Centro 8, Sarco 7, Cala Cala 5, otras zonas 4). Es una muestra por conveniencia: sirve para orientar el piloto, no para generalizar.

| Pregunta | Resultado |
|---|---|
| Preguntó algo en un grupo el último mes | **18 de 24** (12 varias veces, 6 una vez) |
| Cuánto tardó la primera respuesta útil (20 que preguntaron) | 8 menos de 1 h · 9 entre 1 y 24 h · 2 más de un día · 1 nunca |
| Qué le molesta (varias opciones) | **La pregunta se pierde: 14** · No sabe si sigue vigente: 12 · Tardan: 8 · Nadie responde: 3 · Nada: 2 |
| Responde cuando sabe algo | Casi siempre 9 · A veces 12 · Casi nunca 3 |
| Respondería más a cambio de puntos | Sí 11 · Tal vez 10 · No 3 |
| Usaría la app | Sí 11 · Tal vez 9 · No 4 |
| Estudiantes que usarían la app | **8 de 8** (5 sí, 3 tal vez, ninguno no) |

| Dueños de negocio (5) | Resultado |
|---|---|
| Gasto en publicidad al mes | Bs 0: 2 · solo por temporada: 1 · Bs 300: 1 · Bs 500: 1 |
| Que sus ofertas salgan primero en su zona | Sí 2 · Tal vez 2 · No 1 |
| Pagaría Bs 50 al mes | **1 de 5**; los otros 4 proponen unos Bs 20 |
| Prueba gratis | **4 de 5** |

**Lo que cambiamos por esto:**

- **El valor está en ordenar y en que la información sea vigente, no en la rapidez:** casi todos recibieron respuesta en menos de un día, pero la pregunta se pierde y la información envejece. Por eso la búsqueda, la zona y la fecha de cada letrero van primero.
- **Empezamos con estudiantes y negocios cerca de las universidades, en Sarco y el Centro:** ningún estudiante dijo que no, y los dos dueños más dispuestos tienen negocios con clientes jóvenes (una cafetería en Sarco y una fotocopiadora junto a la UMSS).
- **El precio baja a Bs 20 al mes** (ver «Cómo se sostiene»).
- **Subir una oferta tiene que ser muy fácil:** los dueños dicen que sus precios cambian cada semana. Si actualizar cuesta, la app repite el problema de los grupos.

**Lo que falta validar:** si los dueños darían descuentos a cambio de yapitas y cuánto; cuánto debería valer una yapita (preguntaron «¿cuánto vale un punto?» y «¿quién paga el descuento?»); y, tras la prueba gratis, si los negocios siguen subiendo ofertas y cuántos clientes llegan. Las 4 personas que no usarían la app tienen 54 años o más.

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

### Quién controla la emisión (y qué cambia antes de la red principal)

Hoy todo es **custodiado**, y lo decimos tal cual:

- **Se emitió una sola vez un fondo fijo de 1.000.000 de YAPITA** a la distribuidora. Cada premio sale de ese fondo y cada gasto vuelve a él. El servidor de la app **no tiene la clave de la emisora** (solo la distribuidora, cifrada en las variables de Vercel), así que la app no puede crear yapitas nuevas.
- **El equipo sí guarda la clave de la emisora**, fuera del servidor, y técnicamente podría emitir más. Stellar garantiza que cada pago es público y no se puede borrar; no garantiza, por sí solo, un tope de emisión.
- Las cuentas de los vecinos también son custodiadas: la app guarda su clave cifrada (AES-256-GCM) y firma por ellos. Hoy **86 cuentas** tienen la línea de confianza de YAPITA (las de prueba del equipo y del seed incluidas).
- `npm run stellar:reset` solo sirve si testnet se borra: recrea las mismas cuentas y vuelve a pagar, con el mismo memo, cada premio que ya estaba confirmado en la base. No crea premios nuevos.

**Antes de la red principal:** cerramos la emisora (su clave queda con peso 0, así el total no puede crecer nunca), cada vecino pasa a su propia billetera con Pollar y el canje se paga desde el fondo que llenan los negocios.

## Qué construimos en este hackathon

Antes del hackathon no existía nada: empezamos de cero el **20 de noviembre**. Durante el hackathon armamos el prototipo visual, la wiki con las reglas del producto, una prueba del flujo de Stellar en testnet y todo el código de este repositorio. Cada cambio entró por pull request, con verificación de tipos y compilación automáticas.

- **Producto:** Hoy (letreros con foto, búsqueda y etiquetas), ¿Alguien sabe? (preguntas, urgentes, comentarios en tiempo real en cada respuesta, «Me sirvió»), Yo (saldo, movimientos con enlace al explorador, actividad, ajustes), contacto solo con permiso, notificaciones al celular, vista previa al compartir en WhatsApp y app instalable que muestra lo último visto sin señal.
- **Stellar:** activo YAPITA, una cuenta de prueba por vecino, un pago con memo por cada premio o gasto, reintentos si la red falla y `npm run stellar:reset` por si testnet se reinicia.
- **Datos y seguridad:** Postgres con permisos por fila y pruebas (`supabase/tests/rls.sql`), límites contra el abuso aplicados en la base y claves de Stellar cifradas, solo en el servidor.
- **Cómo trabajamos:** cada tarea tiene su especificación en `specs/` (qué entra, qué no, plan y criterios de aceptación) y su tarjeta en el tablero del equipo.
- **Lo que falta:** canje de yapitas con negocios, billeteras propias con Pollar y la red principal de Stellar (ver el plan).

## Cómo se sostiene

Para los vecinos es gratis: ver, publicar, responder y premiar. Marcar una pregunta como urgente cuesta 5 yapitas, que no son dinero.

Pagan los **negocios de barrio**: por **Bs 20 al mes** (precio a validar en el piloto), sus letreros salen primero en Hoy para los vecinos de su zona, con la marca «Destacado». Empezamos con Bs 50, pero en la encuesta solo 1 de 5 dueños lo pagaría y el resto propuso unos Bs 20. En el piloto se paga fuera de la app (QR o transferencia); más adelante, con Pollar.

Ese ingreso llena el fondo del **canje**: el vecino cambia sus yapitas por un descuento en un negocio aliado y va a ese negocio a usarlo. Así el negocio que paga recibe clientes. En la app nunca se muestran bolivianos: el vecino solo ve yapitas.

Cómo lo validamos: los 5 negocios del piloto tienen el primer mes gratis (4 de los 5 dueños encuestados ya aceptaron probar) y al final se les pregunta si pagarían Bs 20; la meta del día 30 es que **5 negocios paguen**.

**Cuántos pueden pagar:** en el departamento de Cochabamba hay **66.170 empresas registradas** ([SEPREC, noviembre de 2025](https://www.seprec.gob.bo/wp-content/uploads/2025/12/Informacion-ESTADISTICA-WEB-NOV_v1.pdf)). Muchos negocios de barrio son informales y no están en ese registro, así que es un piso, no un techo.

**La economía del canje (hipótesis para validar):**

| Supuesto | Valor |
|---|---|
| Valor de canje | 10 yapitas = Bs 1 de descuento en un negocio aliado (nunca se muestra en la app) |
| Lo que gana un vecino activo al mes con las reglas actuales | ~19 yapitas: sube 4 letreros (+4), a 4 personas les sirven (+4), 2 respuestas suyas sirven (+10) y cierra 1 pregunta (+1) |
| Costo de canje por vecino activo | ~Bs 1,90 al mes, si canjea todo |
| Vecinos activos que cubre un negocio a Bs 20 | ~10 |
| Meta del día 30 | 45 activos por semana ≈ Bs 86 al mes de canje → lo cubren 5 negocios a Bs 20 |

Los topes contra el abuso (10 letreros con premio por día, 3 «Me sirvió» con premio por pregunta, 3 premios por día entre las mismas dos personas) evitan que una sola cuenta vacíe el fondo.


## Plan de 30 días

| Fechas | Objetivo | Qué hacemos | Cómo lo medimos |
|---|---|---|---|
| 23 al 29 nov | Piloto en Cochabamba | Aplicar lo que diga el jurado. Construir la marca «Destacado» para los letreros de negocios. Visitar 5 negocios de barrio cerca de las universidades, en Sarco y el Centro, para que suban sus ofertas, y responder preguntas reales en los grupos «¿Alguien sabe?», también el de la UMSS | 30 cuentas y 5 negocios con letreros |
| 30 nov al 13 dic | Confianza y crecer en Cochabamba | Confirmación de correo, verificación con terceros, normativa de datos y reglas de moderación; seguir respondiendo en los grupos y sumar negocios | 20 perfiles verificados |
| 14 al 22 dic | Siguientes implementaciones | Billeteras propias con Pollar, canje de yapitas con negocios aliados, paso a la red principal de Stellar y las primeras ciudades del eje troncal | 1 canje real y 5 negocios que pagan |

**Cómo llegamos a los primeros usuarios:** empezamos por los estudiantes, que en la encuesta fueron los más dispuestos, sin publicidad pagada. Respondemos preguntas reales en los grupos «¿Alguien sabe?» de Cochabamba y de la UMSS y pedimos permiso a sus administradores para presentar la app (sus reglas prohíben la publicidad). En grupos de compra y venta como [«Cala Cala - Ciudad Cochabamba»](https://www.facebook.com/groups/calacala/) (633 miembros) compartimos letreros con su enlace. Antes cargamos letreros reales para que nadie encuentre la app vacía, y cada cuenta nueva recibe 5 yapitas de bienvenida.

**Metas al día 30:** 150 cuentas, 45 activas por semana y menos de 30 minutos hasta la primera respuesta.

## Qué mejoramos después del primer análisis de Atlas

El primer análisis de Atlas dio 67/100. Lo que cambiamos a partir de él:

- **La demo ahora se puede leer sin JavaScript:** la página trae un texto fijo con qué es, qué funciona y los enlaces para comprobarlo (`index.html`).
- **La emisión, dicha con precisión:** la sección «Quién controla la emisión» reemplaza la frase «nadie puede inventar yapitas».
- **Quién paga, contado:** 66.170 empresas registradas en Cochabamba (SEPREC) y la tabla de la economía del canje.
- **Las 10 ciudades, sin exagerar:** el selector ya las tiene, pero el contenido real hoy es de Cochabamba.
- **Modelo de ingresos:** publicidad local para negocios (antes decía también «freemium», y no hay un nivel pago para vecinos).
- **El aporte de todo el equipo, visible:** la carpeta pública de Yaeko y los LinkedIn de Yaeko y Aldrin en «Equipo».
- **Validación con personas reales:** encuesta a 24 personas, 5 de ellas dueños de negocio («Lo que nos dijeron 24 personas»); por ella el precio baja a Bs 20 y el piloto se enfoca en estudiantes y negocios cerca de las universidades.
- **Una sola meta de piloto:** 30 cuentas y 5 negocios en la primera semana. Un título de commit (#72) dice 50 porque fue el primer borrador del mismo cambio; el contenido final dice 30.

## Equipo CodeBambinos

Tres jóvenes de Cochabamba:

- **Yaeko** (product owner): investigación del problema, la paleta aguayo y los logos que usa la app, y los prototipos que inspiraron el diseño (la interfaz final la definió el equipo). [Su carpeta pública de investigación y diseño](https://drive.google.com/drive/folders/10XihD2gUAucDTkXqopMcYlusaX0EGjXb?usp=sharing) · [LinkedIn](https://www.linkedin.com/in/yaeko-norma-cuevas-dalence-345195451/)
- **Diego** (líder técnico): código, datos y Stellar.
- **Aldrin** (desarrollador): pantallas e interfaz. [LinkedIn](https://www.linkedin.com/in/aldrin-oliver-choque-ramirez-6aa193451)

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
