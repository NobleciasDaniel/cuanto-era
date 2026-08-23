# Cuánto Era

Cuánto Era es una extensión para Chrome que recuerda el precio de un producto cuando tú lo decides. Al volver a consultarlo, muestra el precio anterior, la diferencia, el mínimo, el máximo y un historial cronológico.

Todo se almacena en `chrome.storage.local`. La extensión no incluye cuentas, telemetría, servidores externos ni código remoto.

[Política de privacidad](https://nobleciasdaniel.github.io/cuanto-era/) · [Código fuente](https://github.com/NobleciasDaniel/cuanto-era)

## Funciones

- Captura manual desde la pestaña activa.
- Amazon, Mercado Libre y extracción genérica multitienda.
- Detección mediante JSON-LD `Product`/`Offer`, Open Graph, `itemprop` y heurísticas del DOM.
- Identidad separada por producto y variante.
- Precio actual, precio tachado, moneda, vendedor, disponibilidad y envío.
- Miniatura local del producto, creada desde la pestaña visible sin descargar recursos externos.
- Historial sin estados duplicados.
- Comparación monetaria y porcentual.
- Precios mínimo y máximo.
- Panel con búsqueda, filtros, gráfica y acceso rápido a la tienda.
- Importación y exportación JSON.
- Diseño adaptable, modo oscuro y navegación por teclado.

## Instalación en Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo desarrollador**.
3. Pulsa **Cargar descomprimida**.
4. Selecciona la carpeta donde descargaste este repositorio.
5. Fija Cuánto Era en la barra de extensiones.
6. Visita una página de producto y pulsa su icono.

La extensión solicita únicamente `activeTab`, `scripting` y `storage`. `activeTab` concede acceso temporal a la página solamente cuando pulsas la extensión; no observa permanentemente tu navegación.

## Arquitectura

```text
manifest.json
src/
  background/       Inicialización y contador del badge
  content/          Extractor autocontenido inyectado en la pestaña activa
  popup/            Captura y comparación del producto actual
  dashboard/        Historial, filtros, gráfica, importación y exportación
  shared/           Precio, URL, identidad, comparación y almacenamiento
test/
  fixtures/         Páginas simuladas de Amazon, Mercado Libre y tienda genérica
  *.test.js         Pruebas de lógica, almacenamiento y extracción
scripts/
  validate-extension.mjs
```

El extractor sigue esta prioridad:

1. Adaptador específico de la tienda.
2. JSON-LD `Product` y `Offer`.
3. Open Graph y propiedades `product:*`.
4. Microdatos `itemprop`.
5. Heurísticas genéricas del DOM.

Los adaptadores específicos pueden corregir o completar datos estructurados imprecisos publicados por la tienda.

## Desarrollo y pruebas

Requiere Node.js para las pruebas, pero la extensión no necesita Node ni un proceso de compilación para funcionar en Chrome.

```bash
npm install
npm run check
```

`npm run check` valida el manifest, los permisos, la sintaxis, la ausencia de código remoto y ejecuta todas las pruebas.

## Añadir una tienda

1. Abre `src/content/extract-product.js`.
2. Crea una función de adaptador que devuelva los mismos campos que `amazonAdapter`.
3. Detecta el dominio en la selección de `specific`.
4. Añade una página simulada en `test/fixtures`.
5. Añade expectativas en `test/extractor.test.js`.
6. Ejecuta `npm run check`.

Los campos esenciales son `title`, `canonicalUrl` y `price`. Es recomendable proporcionar `productId`, `currency`, `image`, `seller`, `availability` y `variant`.

## Privacidad y límites

- Solo procesa la página cuando pulsas la extensión.
- No evade inicios de sesión, CAPTCHA, paywalls, DRM ni restricciones de una tienda.
- Los cambios frecuentes de HTML pueden requerir actualizar un adaptador.
- Un precio que depende de un cupón no aplicado puede diferir del precio final del carrito.
- El historial no se sincroniza entre navegadores; usa exportar/importar para crear copias.
- Las distintas monedas no se convierten entre sí.
- Los datos desaparecen si eliminas la extensión sin exportar una copia.

## Datos guardados

Cada registro puede incluir fecha, precio, precio original, moneda, vendedor, disponibilidad y envío. El producto conserva título, enlace canónico, tienda, identificador, variante y una miniatura local. Se almacenan como máximo 500 estados por producto.

## Paquete para Chrome Web Store

```bash
npm run release
```

El comando valida permisos, seguridad, iconos, HTML y pruebas; después crea un ZIP limpio en `dist/` con `manifest.json` en la raíz. Los textos y recursos gráficos para completar la ficha se encuentran en `store-assets/`.
