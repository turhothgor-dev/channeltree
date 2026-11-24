# Arquitectura de youtubeChannelOrganizer

Vista general del sistema. Actualízala cuando un cambio modifique la estructura.

## Contexto

Extensión de Firefox (Manifest V3, JavaScript sin compilar) que permite organizar canales de YouTube en grupos y
subgrupos y filtrar los vídeos por grupo. Solo toca `www.youtube.com` (content scripts), su página de opciones
(editor de grupos, ADR 0014), un script de fondo, `browser.storage.local` y, solo si la persona la activa,
`browser.storage.sync` (réplica de grupos, ajustes y canales ocultos, ADR 0028). Sus únicas peticiones de red son las de
la actualización en segundo plano (ADR 0042): solo a `www.youtube.com` y solo desde el script de contenido de una
pestaña de YouTube, sin permisos nuevos. Nombre: «ChannelTree: YouTube Subscriptions & Groups»; «ChannelTree» en la
interfaz (ADR 0050). Los identificadores internos conservan el prefijo `youtube-groups`/`YouTubeGroups`.
## Componentes

Los scripts de contenido son scripts clásicos (sin módulos ES) que se cargan en este orden, según
`manifest.json` (`modules/`, después `ui/`, al final `content.js`), y comparten el ámbito global. Los componentes de
`ui/` solo declaran al cargar; `content.js` los crea con `create(ctx)` y los arranca con `start()` (ADR 0015):

| Componente | Tecnología | Responsabilidad |
| --- | --- | --- |
| `manifest.json` | WebExtensions MV3 | Permiso `storage`, content scripts en `*://www.youtube.com/*`, `options_ui` (página de opciones en pestaña), `background` (`background.js` con `modules/storage.js`, `groups.js`, `settings.js`, `hidden-channels.js`, `backup.js` y `sync.js` en `scripts`, ADR 0028) y `commands` (atajos `open-editor`, `Alt+Shift+G`, y `clear-selection`, `Alt+Shift+X`; ADR 0026) |
| `background.js` | JS clásico, script de fondo | Crea el replicador de `modules/sync.js`, escucha `storage.onChanged` (áreas `local` y `sync`) y atiende `youtube-groups:sync` (`status`, `enable`, `disable`; ADR 0028), `youtube-groups:get-shortcuts` (comandos con su atajo y si se puede abrir la configuración) y `youtube-groups:open-shortcut-settings` (ADR 0033). Escucha `youtube-groups:open-editor` y abre la página de opciones con `runtime.openOptionsPage()` (ADR 0014); con `commands.onCommand`, `open-editor` hace lo mismo y `clear-selection` envía `youtube-groups:clear-selection` a la pestaña activa con `tabs.sendMessage` (sin permiso `tabs`; sin receptor fuera de YouTube se ignora; ADR 0026). Al arrancar borra la clave `youtubeDebug` del antiguo modo de prueba (6-27), sin error si falla |
| `options/` | HTML + JS clásico + CSS | Editor de grupos (`options.html`, `options.js`, `options.css`): árbol con renombrar, icono y color, crear, mover, arrastrar, fusionar, ordenar A-Z y eliminar con "Deshacer", con acciones de fila solo icono; reutiliza `modules/` y `ui/icons-dom.js`, `ui/icon-picker.js` (ADR 0014). `options/unclassified.js` (`YouTubeGroupsUnclassified.create(container, { showNotice, undoGroups, pageSizeControl })`) pinta la bandeja "Canales sin grupo" con selección, "Añadir a…" (ADR 0018) y sugerencias de grupo por palabras clave (ADR 0024); el panel "Canales" del editor edita las palabras clave del grupo seleccionado; `options/hidden-channels.js` (`YouTubeGroupsHiddenList.create(container, { showNotice, pageSizeControl })`) pinta la sección "Canales ocultos (N)" con "Dejar de ocultar" y "Deshacer" (ADR 0021); `options/inactive-channels.js` (`YouTubeGroupsInactiveList.create(container, { showNotice, undoGroups, pageSizeControl })`) pinta la sección "Canales inactivos (N)" con umbral, búsqueda, selección y "Quitar de los grupos" con "Deshacer" (ADR 0023). La página se titula "ChannelTree · Opciones", tiene tres pestañas ARIA (Grupos, Canales —las tres listas seguidas con un solo selector de tamaño `#options-page-size`— y Datos —copia, sincronización y limpieza—; la activa se refleja en el hash con el `id` de su panel) y el aviso fijo abajo, en `document.body` (ADR 0025, 0031, 0032, 0037, 0039); `options/tabs.js` (`YouTubeGroupsOptionsTabs`: `resolveTarget`, `resolveInitialTab`, `getKeyTarget` y `create`) gestiona pestañas, teclado, hash e historial, y los hashes de las siete pestañas antiguas son alias que abren la pestaña nueva y desplazan hasta la sección; en "Grupos" el panel de canales del grupo va bajo el árbol, en una columna y de 20 en 20, y las filas del árbol alternan fondo (`stripeRows`); `options.html` carga además `modules/watched.js`, `settings.js`, `playlists.js`, `new-videos.js` (entre `subscriptions.js` y `hidden-channels.js`, para validar la copia, ADR 0030) y `backup.js`. `options/backup-section.js` (`YouTubeGroupsBackupSection.create(container)`) exporta e importa la copia; `options/sync-section.js` (`YouTubeGroupsSyncSection`) pinta la sección "Sincronización" (casilla, estado, elección traer/enviar/cancelar y avisos) y habla con `background.js` por mensajes (ADR 0028); `options/cleanup-section.js` (`YouTubeGroupsCleanupSection.create(container, { showNotice, undoGroups })` → `{ setGroups }`) analiza y limpia los grupos; `options/view-prefs.js` (`YouTubeGroupsViewPrefs`) lee y guarda en `localStorage` el tamaño de página y la pestaña activa (ADR 0029, 0037); las tres listas de canales muestran bajo la URL la descripción del canal (`.options__channel-description`, truncada a 240 con `title` completo, ADR 0034); y `options/pager.js` (`YouTubeGroupsPager`) aporta `resolvePage`, `describePage`, el marco de cada lista, sin plegado (`createListFrame`, con la opción `controls` para el selector de tamaño, que no se repinta), los controles de página, la conservación del foco y `createListPaging` (estado de paginación por lista: página, foco pendiente y Anterior/Siguiente), usados por las tres listas de canales (ADR 0031) y por el panel "Canales" del editor (10 por página fijo). |
| `modules/group-editor.js` | JS clásico (`YouTubeGroupsEditor`), sin DOM | Lógica pura del editor: `findGroupLocation`, `moveGroup`, `getSiblingMove`, `getMoveTargets`, `getDropPosition`, `summarizeSubtree`, `removeGroupWithSnapshot`, `restoreGroup`, `removeChannels`, `restoreChannels`, `removeChannelsEverywhere` (quita canales de todos los grupos y subgrupos; delega en `YouTubeGroups`), `transferChannels` (copiar o mover canales), `addChannels` (añadir canales nuevos a un grupo, sin duplicar por `getChannelKey`), `addChannelsToGroups` (una asignación canal-grupo por elemento, con `added`, `skipped` y `missing`), `compareNames` (`Intl.Collator` "es", sin mayúsculas ni acentos y con números naturales), `sortSubgroups`, `sortChannels`, `getMergeTargets`, `mergeGroups`, `revertGroups` (deshacer por instantánea del árbol), `normalizeSearchText`, `searchGroups` y sus versiones con escritura (`moveGroupAndSave`, `deleteGroupAndSnapshot`, `restoreGroupAndSave`, `removeChannelsAndSave`, `removeChannelsEverywhereAndSave`, `restoreChannelsAndSave`, `transferChannelsAndSave`, `addChannelsAndSave`, `addChannelsToGroupsAndSave` (con `undo`), `mergeGroupsAndSave`, `sortSubgroupsAndSave`, `sortChannelsAndSave`, `revertGroupsAndSave`, en `withLock`). `revertGroups` y `revertGroupsAndSave` delegan en `YouTubeGroupsUndo` (ADR 0022). Se carga tras `groups.js`; no entra en los content scripts |
| `modules/undo.js` | JS clásico (`YouTubeGroupsUndo`), sin DOM | Deshacer por instantánea de la clave (ADR 0022): `revertSnapshot`, `revertAndSave` (en `withLock`, restaura solo si la clave no ha cambiado desde la acción) y `describeStatus` (texto del aviso tras deshacer: "Deshecho", "Ya estaba deshecho" o "No se puede deshacer: ... han cambiado desde entonces"). Lo usan `groups.js`, `group-editor.js`, `playlists.js` y `ui/panel.js` |
| `modules/storage.js` | JS clásico (`YouTubeGroupsStorage`) | Leer y escribir el árbol de grupos (ADR 0001) los vídeos vistos (ADR 0002), los ajustes (ADR 0003) y las listas de vídeos (ADR 0004). Expone `KEYS` (claves de almacenamiento) y `withLock(key, fn)`, una cola FIFO por clave que serializa las operaciones de leer-aplicar-escribir dentro de la pestaña (ADR 0005), los lectores puros `readGroupsValue`, `readWatchedValue`, `readSettingsValue` y `readPlaylistsValue`, y `getChangedKeys(changes, areaName)` para `storage.onChanged` (ADR 0006). `KEYS.sync` (`youtubeSync`, estado local de la sincronización, ADR 0028) con `readSyncValue`, `getSyncState` y `saveSyncState`. `KEYS.avatars` (`youtubeAvatars`, ADR 0016) con `readAvatarsValue`, `getAvatars` y `saveAvatars`; `KEYS.subscriptions` (`youtubeSubscriptions`, ADR 0018) con `readSubscriptionsValue`, `getSubscriptions` y `saveSubscriptions`; `KEYS.newVideos` (`youtubeNewVideos`, ADR 0019) con `readNewVideosValue`, `getNewVideos` y `saveNewVideos`; `KEYS.hiddenChannels` (`youtubeHiddenChannels`, ADR 0021) con `readHiddenChannelsValue`, `getHiddenChannels` y `saveHiddenChannels`; `KEYS.channelActivity` (`youtubeChannelActivity`, ADR 0023) con `readChannelActivityValue`, `getChannelActivity` y `saveChannelActivity`; `KEYS.pendingUnsubscribes` (`youtubePendingUnsubscribes`, ADR 0035) con `readPendingUnsubscribesValue`, `getPendingUnsubscribes` y `savePendingUnsubscribes(keys, since)` (con `keys` vacío borra la clave); `KEYS.backgroundRefresh` (`youtubeBackgroundRefresh`, ADR 0042) con `readBackgroundRefreshValue`, `getBackgroundRefresh` y `saveBackgroundRefresh` (un `lastStats` guardado por la versión anterior se ignora al leer) |
| `modules/channel-activity.js` | JS clásico (`YouTubeGroupsChannelActivity`), sin DOM | Actividad de canales observada (ADR 0023): constantes (`MONTH_MS`, `THRESHOLD_MONTHS`, ...), `normalizeActivity`, `applyObservations` (puras), `listInactiveChannels` (estado `no-feed`, `stale`, `no-data` o `ready` e inactivos con umbral; `no-data`: ningún canal evaluado tiene vídeo visto), `describeInactivity`, `forgetChannels(state, keys)` (ADR 0035) y `saveObservations` (en `withLock`, escribe solo si cambia algo). Se carga tras `hidden-channels.js` y en `options.html` tras `/modules/hidden-channels.js` |
| `modules/unsubscribes.js` | JS clásico (`YouTubeGroupsUnsubscribes`), sin DOM | Bajas de suscripción (ADR 0035): constantes `MASS_MIN` (10), `MASS_RATIO` (0,25) y `PENDING_MAX_AGE_MS` (30 días), `findGoneKeys`, `splitRenamed` (cambio de `@handle` por nombre normalizado), `planUnsubscribes` (aplicar o aplazar una baja masiva), `normalizePending` y `applyUnsubscribes(seen, { now })` → `{ removed, deferred, renamed }` (escribe en `withLock`, una vez por clave y solo si cambia: grupos, actividad, vídeos nuevos, avatares, pendientes y suscripciones; si una falla, relanza el error). Se carga tras `channel-activity.js` en `manifest.json` |
| `modules/yt-data.js` | JS clásico (`YouTubeGroupsYtData`), sin DOM ni red | Extracción pura del JSON incrustado de YouTube (ADR 0042): `extractJsonAfter`, `readInitialData` (`ytInitialData`), `readYtcfg` (fusiona los `ytcfg.set`), `getCookie`, `getSession` (`loggedIn` y `accountId`), `hashAccount` (SHA-256), `buildAuthHeaders` (`SAPISIDHASH`), `buildBrowseRequest` (continuación de `youtubei/v1/browse`), `parseChannels` (canales de `channelRenderer` y `gridChannelRenderer`) y `parseVideos` (vídeos de `videoRenderer`, `gridVideoRenderer` y `lockupViewModel`, sin Shorts ni directos), con el token de continuación. Se carga tras `unsubscribes.js` |
| `modules/background-refresh.js` | JS clásico (`YouTubeGroupsBackgroundRefresh`), sin DOM | Actualización en segundo plano (ADR 0042): constantes (`INTERVAL_MS` 60 min, `LEASE_MS`, `REQUEST_PAUSE_MS`, `MAX_CHANNEL_PAGES`, `MAX_FEED_PAGES`...), estado `youtubeBackgroundRefresh` (`normalizeRefreshState`), cerrojo entre pestañas (`isDue`, `acquireLease`, `finishRun`, `resetAccount`) y `runRefresh({ fetch, cookie, now, sleep, isEnabled, state, timeoutMs })` → `{ result, error, accountHash }`: lee `/feed/channels` y `/feed/subscriptions` con un `fetch` inyectado y escribe con las funciones de siempre (`saveObservedSubscriptions`, `saveObservedAvatars`, `applyUnsubscribes`, `saveFeedBatch`, `saveObservations`); todo o nada por fuente. Se carga tras `yt-data.js` |
| `modules/hidden-channels.js` | JS clásico (`YouTubeGroupsHiddenChannels`), sin DOM | Canales ocultos (ADR 0021): `normalizeHiddenChannels` (descarta entradas no válidas contando `dropped`), `getHiddenKeys`, `isChannelHidden`, `listHiddenChannels` (más reciente primero), `hideChannel`, `unhideChannels`, `restoreHiddenChannels` (puras) y `hideChannelAndSave`, `unhideChannelsAndSave`, `restoreHiddenChannelsAndSave` (en `withLock`, escriben solo si cambia algo). Se carga tras `new-videos.js` y en `options.html` tras `subscriptions.js` |
| `modules/fxemoji-data.js` | JS clásico (`YouTubeGroupsFxemoji`), sin DOM | Datos de los 66 iconos de grupo de Mozilla fxemoji (CC BY 4.0, ADR 0013): `ICONS` congelado e indexado por id, con `{ codepoint, file, viewBox, shapes }` (el `viewBox` es el de cada SVG; `tennis` lleva `layers` en lugar de `file`). Transcritos de `third_party/fxemoji/*.svg` (fuera del paquete); `tests/fxemoji.test.js` comprueba que coinciden. Se carga antes de `icons.js`; la atribución está en `THIRD_PARTY_NOTICES.md`, incluido en el paquete |
| `modules/icons.js` | JS clásico (`YouTubeGroupsIcons`) | Iconos y colores disponibles para los grupos (`ICON_SET` con `{ id, label, codepoint, category }`, 66 en tres categorías; `ICON_CATEGORIES` con `{ id, label }` en el orden de las pestañas y `getIconCategory(id)`, que devuelve `"general"` si el id no existe), `getIconGraphic(id)` (`{ viewBox, shapes }` de fxemoji o `null`) y `getUiIconPath(id)` con los iconos de interfaz de los botones de tarjeta (`eye`, `check`, `playlist-add`) y de la guía (`settings`, `recycle`, `add`, `edit`, `arrow-up`, `arrow-down`, `palette`, `delete`, `swap`, `ungrouped`, `merge`, `sort-az`, `eye-off`), separados de `ICON_SET`, y `getContrastTextColor(hex)` (blanco u oscuro, el de mayor contraste WCAG, para el número del bullet) |
| `modules/groups.js` | JS clásico (`YouTubeGroups`), sin DOM | Lógica de grupos y subgrupos, apariencia heredada, normalizar URL de canal, pertenencia de un canal a grupos, URL de un grupo para el filtro y `flattenGroups` (árbol aplanado en preorden con nivel), `validateGroupName(name, kind)` (mensaje de error o `null`), `getChannelKey`, `analyzeGroups` y `applyCleanup` (limpieza, puras), `cleanupGroups` (devuelve `undo`), `revertGroupsAndSave` (deshace la limpieza, ADR 0022), `buildChannelColorIndex` (colores de los grupos de cada canal, heredados, sin repetir y como mucho 4) y `getStripeBackground` (degradado de la línea de color) y `buildChannelNameIndex(groups, extraChannels)` (índice de nombre a canal; incluye los canales ocultos, ambiguo solo si las `getChannelKey` difieren). Palabras clave opcionales del grupo (ADR 0024): `removeChannelsEverywhere(groups, keys)` (quita canales de todos los grupos y subgrupos, movida desde `group-editor.js`, ADR 0035), `foldKeyword`, `normalizeKeywords`, `parseKeywordsInput` y `setGroupKeywords` (en `withGroupsLock`, escribe solo si cambia) |
| `modules/keyword-rules.js` | JS clásico (`YouTubeGroupsKeywordRules`), sin DOM | Sugerencias de grupo por palabras clave (ADR 0024): `tokenize`, `matchesKeyword` (palabra completa, sin mayúsculas ni acentos), `collectRules`, `suggestGroup` (la coincidencia más larga; a igualdad, el primero en preorden) y `suggestForSubscriptions`. Solo en la página de opciones (tras `group-editor.js`); no entra en `manifest.json` |
| `modules/avatars.js` | JS clásico (`YouTubeGroupsAvatars`), sin DOM | Avatares de canal (ADR 0016): `normalizeAvatarUrl` (solo `yt3.ggpht.com` y `yt3.googleusercontent.com`, https, tamaño fijo), `isValidAvatarKey`, `getAvatarFor`, `getGroupedChannelKeys`, `getKeptChannelKeys` (agrupados o suscritos conocidos, ADR 0018), `mergeAvatars` (poda los que no están en grupos ni en suscripciones), `getInitial`, `getFallbackColor`, `forgetChannels(avatars, keys)` (ADR 0035) y `saveObservedAvatars` (en `withLock`, escribe solo si cambia algo). Se carga tras `groups.js` |
| `modules/subscriptions.js` | JS clásico (`YouTubeGroupsSubscriptions`), sin DOM | Suscripciones conocidas (ADR 0018): `normalizeSubscriptions`, `mergeSubscriptions` (altas, cambios de nombre y bajas con `reconcileKeys`), `getUnclassifiedSubscriptions` (las que no están en ningún grupo ni subgrupo), `normalizeDescription`, `formatDescription` y `getSubscriptionDescription` (descripción opcional, ADR 0034), `findSubscriptionSectionIndex`, `isChannelListComplete` y `saveObservedSubscriptions` (en `withLock`, escribe solo si cambia algo). Se carga tras `avatars.js` |
| `modules/new-videos.js` | JS clásico (`YouTubeGroupsNewVideos`), sin DOM | Vídeos nuevos por grupo, aproximados (ADR 0019): `normalizeNewVideos`, `applyFeedBatch` (altas, edad de publicación, visitas y poda por 30 días, canal sin grupo y tope de 1000), `acknowledgeGroups` (monótona), `getSubtreeGroupIds`, `countNewVideos` (vídeos nuevos distintos por grupo y subárbol, sin los vistos, con el reconocimiento propio de cada grupo, ADR 0038), `getNewVideoIds` (vídeos nuevos para algún grupo que contiene directamente su canal, para la marca; ADR 0043), `EXIT_ACK_KEY`, `serializeExitAcks` y `parseExitAcks` (traspaso por `sessionStorage` al recargar) y `saveFeedBatch` (en `withLock`, escribe solo si cambia algo) y `forgetChannels(state, keys)` (quita los vídeos de canales dados de baja, ADR 0035). Auxiliares: `getNewVideoStatus` (`new`, `watched`, `no-age`, `seen-before-filter` o `published-before-filter`) y `getGroupAck`. Se carga tras `subscriptions.js` |
| `modules/watched.js` | JS clásico (`YouTubeGroupsWatched`), sin DOM | ID de vídeo desde una URL, marcar y desmarcar vídeos como vistos, `shouldAutoMark` (umbral del marcado automático) y `getWatchedButtonState` (etiqueta, glifo, pulsado y deshabilitado del botón de visto) |
| `modules/playlists.js` | JS clásico (`YouTubeGroupsPlaylists`), sin DOM | Listas de vídeos propias: crear, renombrar y borrar listas, guardar y quitar vídeos, ids de listas de un vídeo y URLs de reproducción (`buildPlayAllUrl`, `buildVideoUrl`, `buildWatchVideosUrl`) y `selectQueueIds` (IDs de la cola de lo visible); `clearPlaylist` (vaciar una lista) y `revertPlaylistsAndSave` (deshacer por instantánea, ADR 0022), con `undo` en las escrituras que lo ofrecen |
| `modules/backup.js` | JS clásico (`YouTubeGroupsBackup`), sin DOM | Copia de seguridad (ADR 0006): `buildBackup`, `parseBackup` (valida y descarta entradas no válidas contando `dropped`), `exportBackup` e `importBackup` (escribe ajustes, grupos, listas, vistos y, si la copia los trae, `avatars`, `hiddenChannels`, `subscriptions`, `newVideos` y `channelActivity`, con `withLock`; ADR 0030). El texto de la copia tiene un límite de 20 MB (`MAX_TEXT_LENGTH`): al importar y al exportar, superarlo da un error de tamaño propio. `parseGroups` conserva las `keywords` de los grupos normalizadas (ADR 0024). `parseSyncData` valida lo recibido por sincronización reutilizando `parseGroups`, `normalizeSettings` y `parseHiddenChannels` (ADR 0028). Se carga tras `playlists.js` |
| `modules/sync.js` | JS clásico (`YouTubeGroupsSync`), sin DOM | Sincronización opcional con `storage.sync` (ADR 0028): funciones puras (`stableStringify`, `hashText`, `chunkText`, `measureItem`, `buildReplica`, `readReplica`, `decideIncoming`), `buildLocalPayload`, `inspect`, `push`, `pull`, `enable`, `disable` y `createReplicator` (cola `youtubeSync:engine`, debounce de envío, recepción, conciliación y mensajes). Solo en el script de fondo y la página de opciones; no entra en los content scripts |
| `modules/settings.js` | JS clásico (`YouTubeGroupsSettings`), sin DOM | Ajustes por defecto (`watchedMode`, `outsideMode`, `autoMarkPercent`, `accentColor` `#rrggbb` con `#1a73e8` por defecto, ADR 0040; `backgroundRefresh` booleano, `true` por defecto, ADR 0042; `showNewBadge` booleano, `true` por defecto, 6-29; `sidebarCollapsed` y `panelCollapsed` se retiraron y se ignoran si vienen guardados), normalizarlos, leerlos y actualizarlos con validación |
| `modules/visibility.js` | JS clásico (`YouTubeGroupsVisibility`), sin DOM | `getCardVisibility`: decide si una tarjeta es `visible`, `dimmed` o `hidden` según filtro, visto y ajustes (con `isHiddenChannel` es siempre `hidden`, ADR 0021); `matchesGroupFilter` admite `exclude` (ADR 0020): con él, el conjunto son claves de canal y pasa el canal que no está en él |
| `modules/metadata.js` | JS clásico (`YouTubeGroupsMetadata`), sin DOM | Interpretar duración, visualizaciones y antigüedad desde el texto de una tarjeta (español e inglés), `FILTER_OPTIONS`, `matchesAdvancedFilters` y `hasActiveFilters` |
| `modules/pages.js` | JS clásico (`YouTubeGroupsPages`), sin DOM | `getPageType(pathname)` clasifica la página (`home`, `subscriptions`, `channels` —`/feed/channels`, ADR 0018—, `search`, `watch` —también `/live/<id>`—, `shorts`, `channel`, `other`), `getNavigationPathname(url, origin)` (ruta de destino de una navegación, o `null`), `shouldShowCardControls(pageType)` indica dónde se ponen botones en las tarjetas, `shouldHideChannels(pageType)` dónde se ocultan los canales ocultos (`home`, `search` y `watch`), `shouldNoteNewVideos(pageType)` dónde se anotan los vídeos nuevos (`home`, `subscriptions`, `search`, `watch` y `channel`; ADR 0038) y `shouldPinGuide(pageType, width, isFullscreen)` si la guía de YouTube se fuerza abierta y fija (solo en `subscriptions`, con `PINNED_GUIDE_MIN_WIDTH` = 792 px o más y sin pantalla completa; ADR 0010 y 0012) y `shouldShowPlayerControls({ pageType, paused, fullscreen, adShowing })` si se muestran los botones sobre el reproductor (solo en `watch`, con el vídeo pausado o terminado, sin pantalla completa ni anuncio) y `shouldShowShortsControls({ pageType, hasActiveReel, fullscreen, adShowing })` si se muestran sobre el Short activo (solo en `shorts`, también reproduciéndose, sin pantalla completa ni anuncio). Se carga tras `metadata.js` |
| `modules/filter.js` | JS clásico (`YouTubeGroupsFilter`), sin DOM | Filtro activo como selección única (ADR 0007 y 0036, que sustituye al 0011): `ALL_FILTER`, `UNGROUPED_FILTER` (clave excluyente `ungrouped`, ADR 0020), `normalizeFilter`, `getFilterKey`, `resolveFilterUrls`, `parseFilterKey`, `normalizeSelection`, `toggleSelection` (devuelve `[]` si la clave ya era la seleccionada y `[clave]` si no), `clearSelection`, `resolveSelection` (conserva solo la primera clave que existe y da sus URL y `exclude`, `true` solo con `["ungrouped"]`, cuyas URL son las claves de canal agrupadas), `shouldNavigateOnSelect` (solo navega al añadir fuera de suscripciones) y el traspaso por `sessionStorage` (`serializePendingSelection`, `parsePendingSelection`, `version: 3`). Se carga tras `pages.js` |
| `modules/guide.js` | JS clásico (`YouTubeGroupsGuide`), sin DOM | Columnas de la sección de la guía lateral: `findGuideInsertionIndex` (dónde insertarla en `ytd-guide-renderer`, sin depender del idioma), `normalizeGuidePath`, `getGuideColumn`, `enterGuideGroup`, `leaveGuideGroup`, `getCreateTarget`, `findGuidePath`, `isChannelListOpen`, `getMenuPosition` (posición del menú de opciones junto al engranaje) y `getMarqueeMetrics(scrollWidth, clientWidth)` (distancia y duración de la marquesina de los nombres truncados, o `null` si caben). Se carga tras `filter.js` |
| `ui/icons-dom.js` | JS clásico (`YouTubeGroupsIconsDom`), con DOM, sin `ctx` | SVG de iconos (`createIconSvg`, `createUiIconSvg`), contenido de los botones de tarjeta (`setCardButtonContent`), marca, banda y bullet de color de un grupo (`createGroupMark`, `setGroupBand`, `setGroupBullet(el, color, count)`, que siempre pinta el bullet (gris sin color) y con `count` > 0 muestra el número de vídeos nuevos, con `99+`; escribe siempre `--yg-bullet-text` (la flecha del hover lo usa también sin número); `describeNewVideos(count)`; `GROUP_ICON_SIZES`), avatar de canal con inicial de reserva (`createChannelAvatar`, `AVATAR_SIZES`) y `shieldControlEvents`. Se carga tras `modules/` (ADR 0015) |
| `ui/icon-picker.js` | JS clásico (`YouTubeGroupsIconPicker`), con DOM, sin `ctx` | Selector de icono y color (`openIconPicker(initial, anchorButton, onSave)`, `hideIconPicker`): botón "Sin icono" y pestañas ARIA por categoría (General, Medios, Deportes) con cuadrícula de 8 × 3 alineada con la fila de colores y navegación con flechas, Inicio y Fin |
| `ui/avatars.js` | JS clásico (`YouTubeGroupsAvatarsUi.create(ctx)`) | Recolector de avatares de canal del DOM de YouTube (`noteCard`, `noteAvatar`, `scanPage`, `scheduleScan`, `setGroupedChannels`, `flushPending`); `ctx.avatars` se crea antes que `ctx.cards` |
| `ui/subscriptions.js` | JS clásico (`YouTubeGroupsSubscriptionsUi.create(ctx)`) | Recolector de suscripciones (ADR 0018): lee la sección de suscripciones de la guía (`readGuide`, `scheduleGuideRead`, `noteMutations`) y los `ytd-channel-renderer` de `/feed/channels` (`noteChannelCard`, que también lee `#description`, ADR 0034; `startVisit`, `checkChannelsList`, con reconciliación a los 3 s con la lista completa; `beginNavigation` en `yt-navigate-start`; `removedKeys`; la reconciliación llama a `YouTubeGroupsUnsubscribes.applyUnsubscribes`, ADR 0035); `flushPending`; `ctx.subscriptions` se crea tras `ctx.avatars` y antes de `ctx.cards` |
| `ui/new-videos.js` | JS clásico (`YouTubeGroupsNewVideosUi.create(ctx)`) | Recolector de vídeos nuevos (ADR 0019): `noteVideo` (desde `ui/cards.js`, en las páginas de `shouldNoteNewVideos`), `flushPending` (como mucho cada 2 s; vuelca también los reconocimientos de salida), `acknowledgeExit` (al salir del filtro, con los descendientes; ADR 0043), `restoreAcks`, `getUnsavedAcks`, `setGroups`, `applyStoredValue`, `recount` y `start`; guarda el recuento en `ctx.state.newVideoCounts` y el conjunto con marca en `ctx.state.newVideoIds`, y llama a `ctx.guide.updateNewVideoBullets()` y a `ctx.cards.applyNewVideoBadgesToAllCards()`, cada uno solo si cambia lo suyo; `ctx.newVideos` se crea tras `ctx.subscriptions` y antes de `ctx.cards` |
| `ui/toast.js` | JS clásico (`YouTubeGroupsToast.create(ctx)`) | Aviso flotante genérico con acción "Deshacer" (`show(message, { actionLabel, onAction })`, `hide()`), un único `#youtube-groups-toast`, texto con `textContent`, se oculta a los 10 s (`DURATION_MS`); `ctx.toast` se crea antes que `ctx.dropdowns` |
| `ui/dropdowns.js` | JS clásico (`YouTubeGroupsDropdowns.create(ctx)`) | Casillas de grupos (`renderChannelGroupChoices`) y los desplegables flotantes de suscripción y de listas; el de suscripción incluye "Ocultar canal" / "Dejar de ocultar" con aviso "Deshacer" (ADR 0021) |
| `ui/player.js` | JS clásico (`YouTubeGroupsPlayer.create(ctx)`) | Botones sobre el reproductor de `/watch` con el vídeo en pausa y sobre el Short activo de `/shorts`; `start()`, `noteMutations()` |
| `ui/watched.js` | JS clásico (`YouTubeGroupsWatchedUi.create(ctx)`) | Marcar como visto (manual y automático), botones y clases de visto; `start()` |
| `ui/cards.js` | JS clásico (`YouTubeGroupsCards.create(ctx)`) | Detectar tarjetas y su canal, botones por vídeo (grupo y visto), filtrado y visibilidad, programación de tarjetas, línea de color del grupo (`applyGroupStripe`, `refreshChannelColorIndex`); `resetDetectedCards()`; marca "Nuevo" en la miniatura, solo con `showNewBadge` activo (`applyNewVideoBadge`, `applyNewVideoBadgesToAllCards`; ADR 0043, 6-29); anota cada vídeo en `ctx.newVideos.noteVideo` y en `ctx.activity.noteVideo` (`noteCardActivity`) |
| `ui/channel-activity.js` | JS clásico (`YouTubeGroupsChannelActivityUi.create(ctx)`) | Recolector de actividad de canales (ADR 0023): `noteVideo` (desde `ui/cards.js`, en cualquier página; en `/feed/subscriptions` marca la visita al feed), `flushPending` (como mucho cada 2 s), `setChannels` y `start`; `ctx.activity` se crea tras `ctx.newVideos` y antes de `ctx.cards` |
| `ui/background-refresh.js` | JS clásico (`YouTubeGroupsBackgroundRefreshUi.create(ctx, options)`) | Programación de la actualización en segundo plano (ADR 0042): `start` (primera comprobación a los 20 s más 0-10 s al azar, cada 5 min y al pasar la pestaña a visible), `stop` y `check` (solo con la pestaña visible, el ajuste `backgroundRefresh` activo y el cerrojo; `error/unsupported` sin `content.fetch`); adaptador de `content.fetch` o `window.wrappedJSObject.fetch` con `cloneInto` y `document.cookie`; `ctx.refresh` se crea tras `ctx.panel` |
| `ui/guide-section.js` | JS clásico (`YouTubeGroupsGuideSection.create(ctx)`) | Sección "ChannelTree" en la guía de YouTube y guía fija (ADR 0010); `start()`, `noteMutations()`, `checkPlacement()`; el bullet de cada grupo, siempre visible, lleva el número de vídeos nuevos y, si el grupo tiene canales, es el botón que despliega la lista (sin flechas ▸/▾); al pasar el ratón o enfocarlo hace zoom y cambia el número por una flecha hacia abajo (fija, sin zoom, con la lista desplegada), sin acento (ADR 0041); desplegar o plegar no filtra ni reconoce vídeos nuevos; `updateNewVideoBullets()` lo actualiza sin rehacer la columna; los nombres truncados se desplazan como marquesina al pasar el ratón o enfocar (escuchadores delegados; sin animación con `prefers-reduced-motion`, solo `title`) (ADR 0036); en la columna raíz añade la entrada "Sin grupo (N)" (ADR 0020); las filas de grupo no llevan botón de reproducir (ADR 0032) |
| `ui/settings-section.js` | JS clásico (`YouTubeGroupsSettingsSection.create(container)` → `{ load, applyStoredValue, applyRefreshStatus }`), con DOM, sin `ctx` | Pestaña Ajustes del menú de la guía (ADR 0032 y 0045): pinta "Vídeos vistos", "Vídeos fuera del filtro" y "Marcar visto al reproducir" con selectores, la casilla "Marcar vídeos nuevos en las miniaturas" (`showNewBadge`, 6-29), y "Color de acento" (`input[type=color]` y "Restablecer", ADR 0040) y la casilla "Actualizar en segundo plano" con su línea de estado (`applyRefreshStatus`, texto según `youtubeBackgroundRefresh` y botón "Usar esta cuenta" con `account-mismatch`, ADR 0042), que se guardan al cambiar (deshabilitados mientras guardan; si falla, vuelven atrás y muestran el error); se carga antes de `ui/panel.js` |
| `ui/shortcuts-section.js` | JS clásico (`YouTubeGroupsShortcutsSection.create(container)` → `{ load }`), con DOM, sin `ctx` | Subapartado "Atajos de teclado" de la pestaña Ajustes (ADR 0033 y 0045): pinta los atajos reales y "Cambiar atajos" pidiéndolos por mensaje a `background.js` (los scripts de contenido no tienen `browser.commands`); el texto con la ruta de `about:addons` siempre está visible; se carga antes de `ui/panel.js` |
| `ui/panel.js` | JS clásico (`YouTubeGroupsPanel.create(ctx)`) | Menú de opciones (ADR 0017): `#youtube-groups-menu`, creado al abrirlo desde el engranaje de la guía, con el título "Opciones de visualización" y las pestañas Listas, Filtros y Ajustes (ADR 0032 y 0045; teclado con flechas, Inicio y Fin; la última pestaña se guarda en `sessionStorage`, `youtubeGroupsMenuTab`; altura limitada a la ventana con scroll solo en el panel activo y recolocado al cambiar de pestaña y con `ResizeObserver`; Ajustes incluye el subapartado de atajos, que se leen al abrir el menú, ADR 0033; la copia y la limpieza están en la página de opciones, ADR 0025; sin "Más opciones…"); `applyStoredSettings(raw)` sincroniza la sección Ajustes y `applyRefreshStatus(raw)` repinta su línea de estado de la actualización en segundo plano (no hace nada con el menú cerrado); `offerUndo` muestra el aviso con "Deshacer" de listas (ADR 0022) sin cerrar el menú; `toggleMenu`, `openMenu`, `closeMenu`, `isMenuOpen` |
| `content.js` | JS clásico (IIFE), orquestador | Crea `ctx` (con `ctx.state`, el estado compartido, y un espacio por componente `ctx.cards`, `ctx.panel`…) y los componentes de `ui/`; selección activa (`setActiveSelection` reconoce la anterior al salir del filtro, `pagehide` y `consumeExitAcks`; ADR 0043) y filtro pendiente, `renderGroupsPanel`, `MutationObserver`, eventos de navegación, arranque, `storage.onChanged` (ADR 0015) y `runtime.onMessage` (`handleRuntimeMessage`: `youtube-groups:clear-selection` vacía la selección y avisa "Selección limpiada"; ADR 0026); la rama `"sync"` de `handleStorageChange` avisa de una recepción nueva de otro dispositivo o del paso a `too-big` (ADR 0028); crea `ctx.refresh` (`ui/background-refresh.js`) tras `ctx.panel` y lo arranca, y la rama `"backgroundRefresh"` llama a `ctx.panel.applyRefreshStatus` (ADR 0042); al leer o cambiar los ajustes reaplica la marca "Nuevo" con `ctx.cards.applyNewVideoBadgesToAllCards` (6-29) |
| `ui/accent.js` | JS clásico (`YouTubeGroupsAccent.applyAccent(doc, color)`), con DOM, sin `ctx` | Crea o actualiza `<style id="youtube-groups-accent">` con `--yg-accent` y `--yg-accent-text` (texto legible según el color); lo aplican `content.js` y `options/options.js` al leer y al cambiar los ajustes (ADR 0040); se carga tras `ui/icons-dom.js` |
| `ui/*.css` | CSS | El hover de los botones usa `var(--yg-accent)` y `var(--yg-accent-text)` (ADR 0040). Los botones de solo icono comparten la clase `youtube-groups__icon-button` de `buttons.css` (36 px, o 28 px con `--small`; ADR 0041); los botones de texto del menú de opciones comparten `youtube-groups__text-button` de `buttons.css` (36 px, o 28 px con `--small`; ADR 0046); los botones de miniatura quedan fuera y los fija una instantánea (`tests/fixtures/overlay-buttons-css.json`). Estilos de lo que añade la extensión (claro y `html[dark]`), uno por componente: `panel.css`, `cards.css`, `dropdowns.css`, `buttons.css`, `icons.css`, `icon-picker.css`, `toast.css`, `guide-section.css` y `fullscreen.css`; la marca "Nuevo" (`.youtube-groups__new-badge`, al final de `cards.css`, con el acento y sin animación con `prefers-reduced-motion`; ADR 0043) no usa las clases de los botones de miniatura; el orden en `manifest.json` es parte de la cascada. El menú de opciones y los desplegables flotantes se ocultan en pantalla completa con `:fullscreen` y `:has(:fullscreen)` (`fullscreen.css`) |
| `tests/` | `node:test` + `node:vm` + `jsdom` | Tests de `modules/` con un `browser.storage.local` simulado (`helpers/load-modules.js`) y tests de DOM de `ui/` (`ui-*.test.js`, también `ui-background-refresh.test.js`; `background-refresh.test.js` y `yt-data.test.js` prueban la actualización en segundo plano con `fetch` simulado y las fixtures de `tests/fixtures/yt-data/`, y `load-modules.js` acepta la opción `store` para que dos contextos compartan almacén como dos pestañas) y del editor (`ui-options.test.js`, con `loadOptionsDom` de `helpers/load-dom.js`) con `helpers/load-dom.js` (su `browser` simulado no tiene `commands`, como los scripts de contenido, y responde por defecto a los mensajes de atajos), que carga los scripts de `manifest.json` en un documento de `jsdom` (`devDependency`, solo tests; `helpers/sync-area.js` simula `storage.sync` con cuota; `loadDom` acepta la opción `localStorage` para sembrar entradas o simular que falla); `tests/fixtures/` guarda instantáneas generadas y revisadas a mano; `spdx-headers.test.js` exige la cabecera SPDX en los ficheros fuente propios (convención en **Convenciones**); excluidos del paquete por `web-ext-config.mjs` |
| `scripts/build-xpi.sh` | bash | Empaqueta `web-ext-artifacts/channeltree-<versión>.xpi` con `web-ext build`, verifica su contenido (sin `docs/`, `tests/`, `third_party/`...; con `manifest.json`, `THIRD_PARTY_NOTICES.md` y `LICENSE.md`) e imprime tamaño y SHA-256; opciones `--require-clean`, `--check-version` y `--dry-run`. Parte del flujo de release de la ADR 0048 (publicación en AMO); excluido del paquete por `web-ext-config.mjs` |

## Flujos principales

- **Detección** (`ui/cards.js`): el `MutationObserver` de `content.js` programa las tarjetas (`VIDEO_CARD_SELECTOR`) y las
  procesa en un `requestAnimationFrame` (`processPendingCards`); cada tarjeta guarda nombre y URL de su canal en
  `data-*`. Procesar una tarjeta ya al día no escribe en el DOM (`setCardButtonContent` y los atributos solo se
  escriben si cambian); si no, la mutación la vuelve a programar y se reprocesa en cada frame. Los botones de las
  tarjetas se ponen en inicio, suscripciones, búsqueda y la columna de recomendaciones
  de `/watch` (`shouldShowCardControls`; allí, en versión compacta y solo en `#related`). En las tarjetas de vídeo el
  control es una columna superpuesta arriba a la izquierda de la miniatura (`ytd-thumbnail` o
  `yt-thumbnail-view-model`, atributo `data-youtube-groups-thumb-host`, no una clase para no excluir la duración en `getCardTexts`), con los botones colapsados (glifo) que muestran su
  texto con el cursor o el foco, y con un escudo de eventos para que pulsarlos no abra el vídeo; si aún no hay
  miniatura, va tras el canal con los textos visibles y se mueve a la miniatura en un procesado posterior;
  en búsqueda, los resultados de canal (`ytd-channel-renderer`) reciben solo "Añadir a grupo". Las recomendaciones de
  `/watch` son `yt-lockup-view-model` (los de listas y mixes quedan excluidos de `VIDEO_CARD_SELECTOR`); si la
  tarjeta no enlaza al canal, en páginas de canal `detectCard` usa el canal de la propia página
  (`getChannelUrlFromPath`) y en el resto lo busca por nombre, solo con los textos de la zona de metadatos
  (`getChannelTexts`), entre los canales guardados (`buildChannelNameIndex` y `matchChannelByTexts` de `YouTubeGroups`, índice `channelNameIndex`
  recalculado en `renderGroupsPanel`; un nombre con dos URL distintas no se usa). En `yt-navigate-finish` (navegación SPA) se reinicia y se vuelve a recorrer el documento.
- **Línea de color en suscripciones** (`ui/cards.js`): `renderGroupsPanel` llama a `refreshChannelColorIndex(groups)`,
  que recalcula `buildChannelColorIndex` y, si cambia, reaplica `applyGroupStripe` a todas las tarjetas. En
  `/feed/subscriptions`, la tarjeta de un canal con colores recibe la clase `youtube-groups--group-stripe` y la propiedad
  `--yg-group-stripe` (`getStripeBackground`); `ui/cards.css` dibuja una línea de 3 px justo encima de la tarjeta. Solo
  se escribe si el valor cambia; fuera de suscripciones se quita en el reprocesado de `yt-navigate-finish`.
- **Botones del reproductor** (`ui/player.js`): en `/watch`, `syncPlayerControl` mantiene un único control
  (`youtube-groups__player-actions`, referencia `playerControl`) dentro de `#movie_player`, con +G, visto y lista del
  vídeo actual y el aspecto de las miniaturas. Se muestra según
  `shouldShowPlayerControls` con `video.paused` del `<video>` de `#movie_player`, `document.fullscreenElement` y
  `ad-showing`. Se recalcula, una vez por frame (`schedulePlayerControlSync`), al arrancar, con `play`, `pause` y `ended`
  (captura en `document`, solo vídeos de `#movie_player`), `yt-navigate-finish`, `fullscreenchange`, al refrescar los
  vistos y desde el `MutationObserver` (si falta el control o cambia el propietario del vídeo). Entre `yt-navigate-start` y
  `yt-navigate-finish` (`playerNavigating`) queda oculto para no mostrar el vídeo anterior. El control detiene los
  eventos de puntero y teclado para no pausar, reanudar ni abrir nada del reproductor.
  En `/shorts`, `syncShortsControl` mantiene un único control (`youtube-groups__shorts-actions`) en el `#player-container`
  del `ytd-reel-video-renderer[is-active]` (arriba a la izquierda), con +G (con "Ocultar canal"), visto y lista del Short
  activo (ID de la URL, canal del reel). Se muestra según `shouldShowShortsControls`, también reproduciéndose. Al
  deslizar se recoloca (cambio de `is-active` o de `location.href`) y, si cambia el ID, cierra los desplegables de grupos
  y de listas. Los flujos de "Marcar como visto", "Listas" y "Añadir un canal a grupos" también se alcanzan desde ahí.
- **Añadir un canal a grupos**: desde el botón de una tarjeta (insertado en el mismo recorrido de tarjetas, uno
  por tarjeta) o desde el "+G" del reproductor en `/watch` o del Short activo en `/shorts`. Ambos usan el mismo selector de casillas
  y `YouTubeGroups.setChannelGroups`, que lee el árbol, calcula la nueva pertenencia y lo escribe una vez. La operación se encola por clave
  (`withLock`, ADR 0005), de modo que dos operaciones solapadas sobre los grupos no se pisan.
- **Filtro** (ADR 0007 y [0036](adr/0036-seleccion-unica-y-bullet-desplegable-en-la-guia.md)): `content.js` guarda una
  `activeSelection` en memoria (`ctx.state.activeSelection`; `toggleSelectionItem` está en `ui/guide-section.js`), un array de a lo sumo una clave (`group:<id>`, `channel:<contenedor>:<url>`, con el contenedor
  codificado); `[]` es "todos". Cada clic en la columna lateral sobre un grupo, subgrupo o canal
  lo selecciona o, si ya era el seleccionado, lo deselecciona (`toggleSelectionItem`, con `toggleSelection(groups, selection, filter)`):
  seleccionar otro sustituye al anterior, y un canal se marca solo en la lista donde se pulsó; el filtro muestra los canales del elemento seleccionado (`resolveSelection`, `activeSelectionUrls`; un traspaso antiguo con varias claves se queda con la primera válida). La clave `ungrouped` ("Sin grupo", ADR 0020) filtra por exclusión: `activeSelectionUrls` son las claves de canal agrupadas, `ctx.state.activeSelectionExclude` es `true` y pasan las tarjetas cuyo canal no está en ellas. El botón
  "Limpiar selección" (icono de reciclaje en la barra de botones de la cabecera de la guía, deshabilitado sin selección y sin número), la vacía sin navegar. Los elementos borrados salen de la
  selección (`refreshActiveSelection`). Si se añade un elemento y la página no es `/feed/subscriptions`
  (`shouldNavigateOnSelect`), se navega a suscripciones pulsando el enlace de suscripciones de la guía de YouTube (o
  `location.assign`), con la selección guardada en `sessionStorage` por si la carga es completa; quitar nunca navega.
  Las tarjetas cuyo canal no está en la unión se ocultan o se atenúan, según el ajuste "Vídeos fuera del filtro". La regla es
  `YouTubeGroupsVisibility.matchesGroupFilter(…, hasFilter)`: sin selección o con los canales aún cargando, pasa; con canal,
  según pertenezca; sin canal identificado pero con ID de vídeo, no pasa (mixes, colaboraciones); sin canal ni ID
  (tarjeta aún sin pintar), pasa.
- **Filtros avanzados**: la pestaña "Filtros" del menú de opciones filtra por duración, fecha y visualizaciones (opciones
  fijas, estado en memoria de la pestaña, `ctx.state.advancedFilters`; sección en `ui/panel.js`). `ui/cards.js` lee los textos visibles de la tarjeta (`getCardTexts`) y
  `YouTubeGroupsMetadata` los interpreta en español e inglés; si un dato no se reconoce, ese criterio deja pasar la
  tarjeta (desconocido = pasa). El resultado se combina con Y con el grupo activo y entra como `matchesFilter`.
- **Visibilidad**: un único `applyCardVisibility` en `ui/cards.js` combina el filtro, el estado de visto y los
  ajustes (caché `settings`) mediante `YouTubeGroupsVisibility.getCardVisibility`, y alterna las clases
  `youtube-groups--hidden` y `youtube-groups--dimmed`. Ocultar gana a atenuar. Se reevalúa al procesar cada
  tarjeta, al cambiar el filtro, al marcar un vídeo y al cambiar un ajuste. Los canales ocultos (ADR 0021) pasan
  `isHiddenChannel` y ganan a todo: la tarjeta se oculta siempre, sin depender de `outsideMode` ni `watchedMode`.
- **Canales ocultos** (ADR 0021): la clave aparte `youtubeHiddenChannels` (`{ version: 1, channels: { <getChannelKey>:
  { name, url, hiddenAt } } }`) guarda los canales cuyos vídeos no se muestran en `home`, `search` y `watch`
  (`shouldHideChannels`; nunca en suscripciones ni en la página del canal). `renderGroupsPanel` la lee, guarda
  `ctx.state.hiddenChannels` y `hiddenChannelKeys` y reevalúa las tarjetas; la tarjeta se identifica por la URL del
  canal y, sin enlace (recomendaciones de `/watch`), por nombre mediante `channelNameIndex`, que incluye los ocultos.
  Se oculta desde "Ocultar canal" en el desplegable de "+G", con un aviso `ui/toast.js` de 10 s con "Deshacer"; el
  editor lista los canales ocultos y permite dejar de ocultarlos. `storage.onChanged` con `"hiddenChannels"` repinta.
- **Marcar como visto** (`ui/watched.js`): lee los vistos al arrancar (`start()`, `ctx.state.watchedVideos`). El botón "Marcar visto" de la
  tarjeta o el del reproductor (en `/watch`) o del Short activo (en `/shorts`) llama a `YouTubeGroupsWatched.setVideoWatched`, que lee,
  aplica el cambio y escribe una vez solo si cambia algo, encolada por clave (`withLock`, ADR 0005). Después `ui/watched.js` actualiza la caché, la clase
  `youtube-groups--watched` de todas las tarjetas con ese ID de vídeo y los botones.
  Las tarjetas de Shorts de las estanterías (`ytd-reel-item-renderer`, `ytm-shorts-lockup-view-model*`) reciben marca
  de visto y filtro, sin botones. En `/shorts` el canal actual sale de `ytd-reel-video-renderer[is-active]`.
- **Marcado automático**: un escuchador de `timeupdate` en `document` (fase de captura) llama a
  `handleVideoProgress`. Solo actúa una vez leídos los ajustes (`settingsLoaded`), si `autoMarkPercent` no es 0, el `<video>` está en `#movie_player` o `#shorts-player` sin
  `ad-showing`, el ID de `/watch` coincide con `ytd-watch-flexy[video-id]` (si existe), en `/shorts` el ID actual está
  armado (`YouTubeGroupsWatched.updateAutoMarkArm`: se arma al ver `currentTime < 1`), el vídeo no está visto ni
  guardándose ni ya tratado en la pestaña (`autoMarkHandledIds`) y `YouTubeGroupsWatched.shouldAutoMark` da `true`.
  Entonces `markVideoWatched` guarda igual que el marcado manual. El porcentaje (0, 50, 80 o 95) se elige en
  "Ajustes" del menú de la guía (ADR 0032).
- **Listas**: listas de vídeos locales, sin API de YouTube (ADR 0004). El botón "Lista" de la tarjeta o "Lista" del
  reproductor (en `/watch`) o del Short activo (en `/shorts`) abre el mismo desplegable de casillas (`openPlaylistForm`), que llama a
  `YouTubeGroupsPlaylists.setVideoPlaylists` (una lectura y, solo si cambia algo, una escritura, encoladas por clave con `withLock`, ADR 0005). Las listas se
  gestionan en la pestaña "Listas" del menú de opciones: crear, renombrar, eliminar, ver (modal con "Quitar" y "Vaciar lista") y reproducir. Eliminar, Quitar y Vaciar no piden confirmación: avisan con "Deshacer" durante 10 s (ADR 0022).
  "Reproducir" es un enlace a `https://www.youtube.com/watch_videos?video_ids=...` con los 50 primeros vídeos.
- **Reproducir lo visible**: el botón de la pestaña "Listas" del menú recorre las tarjetas (`VIDEO_CARD_SELECTOR`), descarta las que no son
  visibles (`checkVisibility()`) o están ocultas, atenuadas o vistas (`selectQueueIds`) y navega a `watch_videos` con los
  50 primeros (`buildWatchVideosUrl`); si no queda ninguno, muestra un aviso sin navegar.
- **Sincronización entre pestañas**: `content.js` (orquestador) registra `handleStorageChange` en `browser.storage.onChanged`
  (ADR 0006). `getChangedKeys` indica qué claves lógicas (`groups`, `watched`, `settings`, `playlists`) han cambiado
  en el área `local` y los lectores puros (`read*Value`) interpretan el nuevo valor. Cada clave actualiza su caché y
  repinta su parte: vistos (tarjetas y reproductor), ajustes (visibilidad y la sección Ajustes del menú, `panel.applyStoredSettings`), grupos (filtro activo y
  guía) y listas (sección "Listas" y modal "Ver", que se cierra si la lista ya no existe). El evento llega también
  a la pestaña que escribe; repintar dos veces es inocuo.
- **Guía lateral** (ADR 0010, `ui/guide-section.js`): `renderGuideSection` (en `renderGroupsPanel`) pinta la sección "ChannelTree"
  en `ytd-guide-renderer #sections`, antes de la sección que da `findGuideInsertionIndex` ("Más de YouTube";
  con `-1`, tras la primera), y solo la mueve si no está en su sitio; si no hay guía, no pinta. El ancla se guarda en
  caché (`getGuideAnchor`, `guideAnchorCache`) para no recorrer los enlaces de la guía en cada lote de mutaciones; el
  `MutationObserver` la invalida si cambia algo en `#sections` ajeno a nuestra sección. `scheduleGuideCheck`
  (como mucho una comprobación por frame, desde el `MutationObserver`) la recrea o recoloca. **Guía fija**:
  `syncGuidePin` pone o quita la clase `youtube-groups--guide-pinned` en `<html>` según `shouldPinGuide`, al arrancar,
  en `yt-navigate-start` (con la ruta de destino, `getNavigationPathname`), `yt-navigate-finish`, `popstate`, `fullscreenchange`, `resize` (una vez por frame) y si
  cambia `location.pathname` en el `MutationObserver` (`noteMutations`). Con la clase, reglas de `ui/guide-section.css` (todas bajo ella) ocultan
  la mini-guía, el velo y la cabecera propia del cajón, dejan `tp-yt-app-drawer#guide` visible y fijo bajo el masthead y dan
  `margin-left` a `ytd-page-manager#page-manager`; un `click` en captura neutraliza ☰ (`#guide-button`) mientras la
  clase está puesta. Fuera de suscripciones y por debajo de 792 px YouTube se comporta como siempre. La sección muestra una sola columna (`getGuideColumn`) que se desplaza con animación al entrar en cualquier
  grupo o subgrupo ("›" en todos; una subcolumna vacía dice "Sin subgrupos") o volver ("‹"). La cabecera tiene tres filas (ADR 0044): el encabezado fijo "ChannelTree" (sin acción), la barra de botones de
  icono alineada a la derecha (crear (+), "Limpiar selección" (reciclaje, deshabilitado sin selección y sin insignia), editar (lápiz) y el
  engranaje que abre el menú de opciones, ADR 0017) y la fila de navegación, con "‹" (oculto en la raíz) y el rótulo
  "Suscripciones" o el nombre del grupo abierto, que usa la marquesina si no cabe. Tras "›" el foco pasa a "‹" y tras
  "‹" vuelve al "›" del grupo dejado. No hay pie. El botón de crear
  depende de la selección (`getCreateTarget`; destino completo en `title` y `aria-label`:
  grupo en la raíz, subgrupo del grupo seleccionado; sin selección en una subcolumna, del padre de la columna; tras crear un subgrupo
  se pasa a la columna del padre con `findGuidePath`) (formulario con icono y color opcionales,
  `validateGroupName` y `setGroupAppearance`) y, por elemento, una lista de canales desplegable
  (`isChannelListOpen`, abierta si contiene un canal seleccionado). No hay elemento "Todos": grupos y canales alternan con `toggleSelectionItem`. No edita ni borra
  grupos: eso se hace en el editor (página de opciones), que se abre con el lápiz "Editar grupos". La columna es el único sitio para elegir el filtro y, junto con el editor, para crear grupos y subgrupos. Si YouTube cambia el DOM de la guía y la sección no aparece, no se puede
  filtrar ni abrir el menú de opciones hasta corregirlo. El engranaje abre `#youtube-groups-menu` (`ui/panel.js`) (título "Opciones de visualización" y pestañas Listas, Filtros y Ajustes, sin "Más opciones…", ADR 0032 y 0045; altura limitada a la ventana) junto a
  la guía, colocado con `getMenuPosition`; se cierra con Escape, clic fuera, el engranaje, `yt-navigate-start` o `resize`, y
  conserva su estado al cerrarse. El color de un grupo es un bullet (`setGroupBullet`) a la derecha de su botón, sin banda; sin color, sin bullet. Editar,
  mover y borrar grupos se hace en la página de opciones (flujo "Editor de grupos"); `removeChannelFromGroup` en
  `modules/groups.js` sigue sin enlazar; quitar canales en bloque se hace desde el panel "Canales" del editor.
- **Editor de grupos** (ADR 0014, `options/`): el lápiz ("Editar grupos") de la barra de botones de la guía
  envía `youtube-groups:open-editor` a `background.js`, que llama a `runtime.openOptionsPage()`; también se abre
  desde `about:addons` o con el atajo (ADR 0026). La página tiene tres pestañas (ADR 0037, 0039): "Grupos" (árbol con
  filas alternas y, debajo, el panel de canales del grupo de 20 en 20), "Canales" ("Canales sin grupo", "Canales
  ocultos" y "Canales inactivos", no plegables y paginadas, con un único selector "Mostrar 10 / 20 / 50 / 100 canales
  por página", 20 por defecto, que afecta a las tres) y "Datos" ("Copia de seguridad", "Sincronización" y
  "Limpieza"); tamaño y pestaña activa se recuerdan en `localStorage` (ADR 0029, 0037). "Seleccionar la página" y
  "Aplicar sugerencias de la página" actúan solo sobre la página visible; "Añadir a…" y "Quitar de los grupos" sobre
  toda la selección. `options/options.js` pinta el árbol (listas anidadas con `role="tree"`, sin `innerHTML`) y
  permite renombrar en línea, cambiar icono y color (`YouTubeGroupsIconPicker`), crear grupos y subgrupos,
  "Mover a…", arrastrar y soltar, `Alt+↑/↓` sobre la fila y eliminar con aviso y "Deshacer" durante 10 s. Las acciones
  de cada fila son solo icono (`iconButton`, con `aria-label` y `title`) en el orden renombrar, icono y color,
  eliminar, mover a, fusionar con, ordenar subgrupos A-Z (solo si hay 2 o más subgrupos desordenados) y añadir
  subgrupo, y el nombre ocupa el espacio flexible de la fila con
  elipsis. "Fusionar con…" abre un selector en línea y funde el grupo en el destino (canales sin duplicar al final,
  subgrupos al final); "Ordenar A-Z" existe para los grupos de primer nivel (cabecera), los subgrupos de un grupo
  (fila) y los canales de un grupo (panel "Canales"); los dos primeros solo se muestran cuando ordenar cambiaría algo.
  El panel "Canales" pagina de 10 en 10 con `YouTubeGroupsPager.createListPaging` (marco mínimo, sin selector de
  tamaño ni preferencia), con "Seleccionar la página" y acciones sobre toda la selección. Fusionar y ordenar avisan con "Deshacer" 10 s, que restaura
  una instantánea del árbol solo si nada ha cambiado entre medias (`revertGroups`). La lógica pura está en
  `modules/group-editor.js` (`moveGroup`, `getDropPosition`, `summarizeSubtree`, `removeGroupWithSnapshot`,
  `restoreGroup`, `mergeGroups`, `sortSubgroups`...) y las escrituras van en `withLock` (ADR 0005). Al seleccionar un grupo, el panel "Canales" lista
  los suyos con selección múltiple para quitar (con "Deshacer" 10 s), copiar o mover a otro grupo
  (`removeChannelsAndSave`, `restoreChannelsAndSave`, `transferChannelsAndSave`); el buscador de la pestaña Grupos
  («Buscar grupos y canales»; `searchGroups`, sin mayúsculas ni acentos) filtra árbol y canales y oculta mover y
  arrastre mientras está activo. Cada canal del panel muestra su descripción a la derecha, como las listas de Canales
  (ADR 0034). Bajo el árbol, la sección "Canales sin grupo" (`options/unclassified.js`) lista las suscripciones
  conocidas que no están en ningún grupo, con selección múltiple y "Añadir a…" un grupo o subgrupo
  (`addChannelsAndSave`); el buscador de la pestaña Canales («Buscar canales») filtra las tres listas, con su
  propio texto. Los títulos de sus secciones usan el mismo estilo `h2` que los de Datos. Si el nombre de la suscripción contiene una palabra clave
  del grupo (ADR 0024, editada en el panel "Canales"), la fila sugiere ese grupo y se puede aplicar la sugerencia de
  una fila o de todas las visibles, con "Deshacer" (`addChannelsToGroupsAndSave`); nunca se asigna sin acción de la
  persona. La página escucha `storage.onChanged` (ADR 0006) y las
  pestañas de YouTube repintan con el mismo evento.
- **Suscripciones conocidas** (ADR 0018): además de lo que se ve, el actualizador en segundo plano (ADR 0042);
  `ui/subscriptions.js` lee del DOM la sección de la guía con
  el enlace `/feed/channels` (parcial: solo altas) y los `ytd-channel-renderer` de `/feed/channels`. Los guarda en la
  clave aparte `youtubeSubscriptions` (`{ version: 1, channels: { <getChannelKey>: { name, url, firstSeen, description? } } }`,
  `description` opcional, leída de `#description` y truncada para mostrar a 240 caracteres, ADR 0034;
  incluida en la copia de seguridad, ADR 0030) con como mucho una escritura cada 2 s (`flushPending` →
  `saveObservedSubscriptions`). Solo en `/feed/channels`, con la lista completa (sin continuación y todas anotadas) y
  3 s sin canales nuevos, se reconcilia una vez por visita (el reinicio de "lista fresca" es `beginNavigation()`, en
  `yt-navigate-start`) y se dan de baja las que ya no aparecen (ADR 0035): `applyUnsubscribes` las quita, sin avisar,
  de todos los grupos y subgrupos, de `youtubeChannelActivity`, `youtubeNewVideos` y `youtubeAvatars`, y por último de
  `youtubeSubscriptions` (cada clave una vez en su `withLock`; si una escritura falla se para y la siguiente lectura
  completa lo reintenta). No toca `youtubeHiddenChannels` ni un canal agrupado que nunca estuvo en suscripciones.
  Salvaguardas: una baja masiva (más de 10 y más del 25 % de las conocidas) no se aplica hasta que una segunda lectura
  completa la confirma, y se guarda como aplazada en `youtubePendingUnsubscribes` (`{ version: 1, keys, since }`, se
  descarta a los 30 días; fuera de `storage.sync` y de la copia); una baja cuyo nombre coincide con el de un canal visto
  con otra clave se trata como cambio de `@handle` y solo sale de `youtubeSubscriptions`. `removedKeys` evita que la
  guía, que YouTube no refresca, vuelva a dar de alta la baja (también las que otra pestaña saca de
  `youtubeSubscriptions`). Las claves que salen de los grupos se anotan en `youtubeRecentUnsubscribes`
  (`{ version: 1, keys }`, 30 días; fuera de la réplica y de la copia) para que `pull` de la sincronización no las
  reintroduzca. El editor las
  cruza con los grupos (`getUnclassifiedSubscriptions`) para la bandeja; los avatares de las suscripciones conocidas
  también se conservan.
- **Vídeos nuevos por grupo** (ADR 0019): además de lo que se ve, el actualizador en segundo plano (ADR 0042);
  `ui/cards.js` anota en `ui/new-videos.js` cada vídeo que
  procesa en inicio, suscripciones, búsqueda, watch y canal (`shouldNoteNewVideos`; ADR 0038) (id, canal agrupado y, si hace falta, la edad "hace N horas"; una antigüedad que llega tarde se completa en un volcado posterior). Como mucho cada 2 s,
  `flushPending` → `saveFeedBatch` guarda en la clave aparte `youtubeNewVideos` (`{ version: 1, since, videos: { <id>:
  { channel, seenAt, publishedBefore } }, visits: { <groupId>: ms } }`, incluida en la copia de seguridad, ADR 0030) los vídeos nuevos
  y las visitas, y poda lo antiguo. Un vídeo es nuevo si no está visto y es posterior al reconocimiento propio de cada
  grupo (su visita, o `since`), sin herencia entre grupos (ADR 0038). Se reconoce **al salir del filtro** (ADR 0043):
  `setActiveSelection` llama a `acknowledgeExit` con la selección anterior (quitar, cambiar de grupo, canal o "Sin
  grupo", limpiar) y reconoce el grupo y todo su subárbol con el instante de salida; aplicar o navegar con el filtro
  activo no reconoce. En `pagehide` (si no hay traspaso de filtro) se reconoce la salida, se guarda lo pendiente en
  `sessionStorage` (`EXIT_ACK_KEY`) y se intenta volcar; al arrancar `consumeExitAcks` lo recupera (al cerrar la
  pestaña puede perderse). `countNewVideos` da el número por grupo (con
  subgrupos) y `ctx.guide.updateNewVideoBullets()` lo pinta en el bullet. `getNewVideoIds` da los vídeos nuevos para
  algún grupo que contiene directamente su canal y `ui/cards.js` pinta en su miniatura la pastilla "Nuevo"
  (`applyNewVideoBadge`, no en Shorts, y solo si el ajuste `showNewBadge` está activo; `content.js` la reaplica
  con `applyNewVideoBadgesToAllCards` al cambiar los ajustes); `storage.onChanged` con `"newVideos"` o
  `"watched"` recalcula.
- **Canales inactivos** (ADR 0023): además de lo que se ve, el actualizador en segundo plano (ADR 0042); `ui/cards.js` anota en `ui/channel-activity.js` (`ctx.activity`) la
  edad de cualquier tarjeta de vídeo de un canal conservado (agrupado o suscripción conocida), en cualquier página; en
  `/feed/subscriptions` además marca la visita al feed. Como mucho cada 2 s, `flushPending` → `saveObservations`
  (`applyObservations`, en `withLock`, escribe solo si cambia) guarda en la clave aparte `youtubeChannelActivity` (`{
  version: 1, lastFeedAt, channels: { <getChannelKey>: { trackedSince, lastPublished } } }`, incluida en la copia de
  seguridad, ADR 0030) y poda los canales no conservados. Si pasan más de 30 días sin visitar el feed, la observación se
  reinicia. El editor (sección "Canales inactivos (N)", `options/inactive-channels.js`) llama a
  `listInactiveChannels` con el umbral elegido (3, 6 o 12 meses, 6 por defecto, sin guardar): inactivo es el canal
  agrupado y suscrito observado todo el plazo sin vídeo visto en él; si no se ha visto la antigüedad de ningún vídeo
  (`no-data`) no lista nada y lo explica. "Quitar de los grupos" usa
  `removeChannelsEverywhereAndSave` y ofrece "Deshacer" con `revertGroupsAndSave` (ADR 0022); `storage.onChanged` con
  `"channelActivity"` repinta la sección.
- **Avatares de canal** (ADR 0016): además de lo que se ve, el actualizador en segundo plano (ADR 0042); `ui/avatars.js` lee del DOM de YouTube (tarjetas, resultados de
  canal, propietario en `/watch`, cabecera de canal y suscripciones de la guía) la imagen de cada canal con
  `AVATAR_IMG_SELECTOR`, la anota en memoria y, si el canal está agrupado y el avatar falta o cambia, la guarda
  en la clave aparte `youtubeAvatars` (`{ version: 1, avatars: { <getChannelKey>: <url> } }`) con como mucho una
  escritura cada 2 s (`flushPending` → `saveObservedAvatars`, que poda los canales que no están en grupos ni en
  suscripciones conocidas, ADR 0018). La guía y el panel
  "Canales" del editor leen `getAvatars()` y pintan `createChannelAvatar` (círculo con la inicial y, encima, la
  imagen sin `Referer`; si falla, queda la inicial); `storage.onChanged` con `"avatars"` repinta. La copia de
  seguridad incluye `avatars` (opcional al importar).
- **Limpieza**: la sección "Limpieza" de la página de opciones (`options/cleanup-section.js`, ADR 0025) analiza el árbol con `YouTubeGroups.analyzeGroups`:
  canales repetidos en un mismo grupo (misma `getChannelKey`, se conserva el primero), URL no válidas (las
  recuperables, con `normalizeChannelUrl` no nulo, se corrigen y conservan sus campos; solo se quitan las
  irrecuperables o las que quedarían repetidas) y grupos sin canales en todo su subárbol. Tras elegir qué quitar, sin confirmación y con aviso "Deshacer" (ADR 0022), `cleanupGroups` lee, aplica `applyCleanup` y
  escribe una sola vez bajo `withGroupsLock`, solo si algo cambia. Después la página se repinta y el informe se rehace (`setGroups`); en las pestañas de YouTube, `storage.onChanged`
  repinta la guía y revisa el filtro activo (si su grupo se borró, la selección se vacía).
- **Copia de seguridad**: la sección "Copia de seguridad" de la página de opciones (`options/backup-section.js`, ADR 0025) tiene "Exportar copia" e "Importar copia". Exportar descarga
  `youtube-groups-AAAA-MM-DD.json` (`exportBackup`, formato del ADR 0006). Importar pide confirmación, lee el fichero
  y llama a `importBackup`: `parseBackup` valida todo antes de escribir (si falla, no cambia nada) y descarta las
  entradas sueltas no válidas, que se cuentan en el mensaje. La copia incluye `avatars`, `hiddenChannels`, `subscriptions`, `newVideos` y
  `channelActivity` (opcionales al importar: sin ellos, no se toca la clave) y admite hasta 20 MB; no incluye el estado
  de la sincronización (`youtubeSync`) ni las preferencias de vista de `localStorage`, que son de cada dispositivo
  (ADR 0030). Tras escribir, `storage.onChanged` repinta la interfaz.
- **Sincronización entre dispositivos** (ADR 0028, modifica el 0006): desactivada por defecto; la activa la persona en
  la sección "Sincronización" de la página de opciones, en cada dispositivo. `background.js` mantiene un replicador
  (`createReplicator`) que, con cambios locales en grupos, ajustes o canales ocultos, espera un debounce y escribe en
  `storage.sync` una réplica troceada (`ygSync:meta` y trozos, `buildReplica`) que cabe en la cuota (95 KiB); si no
  cabe, pasa a `too-big`, se desactiva y no toca los datos locales. Al recibir cambios de `storage.sync`
  (`decideIncoming`, con hash para no devolver lo recibido) valida con `parseSyncData` y los importa sin reenviarlos;
  si se editó en los dos a la vez, queda el último cambio completo de uno. Al activar con datos distintos en la
  réplica, la persona elige traer, enviar o cancelar (`inspect`, `enable` con `direction`). El estado local
  (`youtubeSync`: `lastSentAt`, `lastReceivedAt`, `status`) avisa a la página de opciones y a las pestañas de YouTube
  por `storage.onChanged`. Sin permisos nuevos ni red.
- **Actualización en segundo plano** (ADR 0042): con el ajuste `backgroundRefresh` activo, `ui/background-refresh.js`
  comprueba en la pestaña de YouTube visible (a los 20 s de cargar más 0-10 s al azar, cada 5 min y al pasar a visible)
  si toca (`isDue`: 60 min desde el último intento de cualquier pestaña y sin cerrojo vigente) y toma el cerrojo
  `lease` de `youtubeBackgroundRefresh` (`acquireLease`: escribe, espera 1 s y relee; solo sigue el dueño). `runRefresh`
  pide con `content.fetch` o, si no existe, `window.wrappedJSObject.fetch` (clonando con `cloneInto`) `/feed/channels` y, si hay sesión y es la misma cuenta
  (`accountHash`, SHA-256 del `DATASYNC_ID`), sus continuaciones `youtubei/v1/browse` con `SAPISIDHASH`, con 1,5 s de
  pausa y tope de 30 s por petición; extrae con `YouTubeGroupsYtData` y escribe con las funciones de siempre
  (suscripciones, avatares y, solo con la lista completa, `applyUnsubscribes` con sus salvaguardas). Después lee
  `/feed/subscriptions` (hasta 4 páginas, parando al llegar a lo anterior a `lastSuccessAt`) y escribe `saveFeedBatch`
  sin reconocer ningún grupo y `saveObservations` con `feedVisited`. Todo o nada por fuente: un fallo (`network`,
  `http`, `unrecognized`, `unsupported`) no escribe lo pendiente de esa fuente. Sin sesión, `no-session`; con otra
  cuenta, `account-mismatch` sin escribir nada hasta "Usar esta cuenta" (`resetAccount`). `finishRun` libera el cerrojo
  y anota el resultado; la línea de estado de Ajustes se repinta con `storage.onChanged`. La clave queda fuera de la
  réplica y de la copia; la cookie y el id de cuenta no se guardan ni se registran.
- **Atajos de teclado** (ADR 0026): `manifest.json` declara `commands`. `Alt+Shift+G` (`open-editor`) hace que
  `background.js` abra la página de opciones; `Alt+Shift+X` (`clear-selection`) hace que `background.js` consulte la
  pestaña activa (`tabs.query`, solo `id`) y le envíe `youtube-groups:clear-selection`; `content.js` vacía la selección
  sin navegar y avisa "Selección limpiada". Fuera de YouTube no hay receptor y el rechazo se ignora. Sin permisos nuevos.
  La lista de atajos está en Ajustes del menú de la guía (ADR 0033): al abrir el menú, `ui/shortcuts-section.js`
  envía `youtube-groups:get-shortcuts` y `background.js` responde con `commands.getAll()`; "Cambiar atajos" envía
  `youtube-groups:open-shortcut-settings` y `background.js` llama a `commands.openShortcutSettings()` si existe. El
  texto con la ruta de `about:addons` está siempre visible.

## Convenciones

- Cada fichero fuente propio (`.js`, `.mjs`, `.css`, `.html`, `.sh` de la raíz, `modules/`, `ui/`, `options/`, `scripts/` y `tests/`, salvo `tests/fixtures/`) empieza por la cabecera SPDX de dos líneas (`SPDX-License-Identifier: GPL-3.0-or-later` y `Copyright (C) 2026 Javier López Diego`) en el comentario de su lenguaje, tras el shebang o `<!doctype html>` si los hay; con material de terceros, el identificador compuesto y una línea que remite a `THIRD_PARTY_NOTICES.md`. Lo comprueba `tests/spdx-headers.test.js`.

## Decisiones

Las decisiones relevantes están en `docs/adr/`. El filtro activo y el paso a suscripciones:
[ADR 0007](adr/0007-filtro-activo-y-paso-a-suscripciones.md). La columna lateral propia (sustituida):
[ADR 0008](adr/0008-columna-propia-que-desplaza-el-contenido.md). La sección en la guía de YouTube, fija
(modificado por el 0012 para fijarla solo en suscripciones): [ADR 0010](adr/0010-seccion-en-la-guia-de-youtube-fija.md) y
[ADR 0012](adr/0012-guia-fija-solo-en-suscripciones.md). La selección limitada a hermanos (sustituye al 0009,
que sustituía en parte al 0007): [ADR 0011](adr/0011-seleccion-de-hermanos.md). La interfaz dividida en componentes
de `ui/` con `ctx` y tests de DOM: [ADR 0015](adr/0015-componentes-de-interfaz-en-ui.md). El editor de grupos en la
página de opciones: [ADR 0014](adr/0014-pagina-de-opciones-editor-de-grupos.md). Los avatares de canal en una clave aparte, capturados
del DOM: [ADR 0016](adr/0016-avatares-de-canal-en-clave-aparte.md). El menú de opciones en la guía en lugar del panel
flotante (modifica 0003, 0010 y 0014): [ADR 0017](adr/0017-menu-de-opciones-en-la-guia.md). Las suscripciones conocidas
en una clave aparte, leídas del DOM (modifica 0016): [ADR 0018](adr/0018-suscripciones-conocidas-en-clave-aparte.md). Los vídeos nuevos por grupo,
aproximados con lo observado en suscripciones: [ADR 0019](adr/0019-videos-nuevos-por-grupo-aproximados.md). El filtro "Sin grupo", clave excluyente con filtro por
exclusión (modifica 0011): [ADR 0020](adr/0020-filtro-sin-grupo-excluyente.md). Los canales ocultos en una clave aparte, aplicados en inicio,
búsqueda y recomendaciones (modifica 0006): [ADR 0021](adr/0021-canales-ocultos-en-clave-aparte.md). El deshacer por
instantánea de la clave en lugar de `confirm`: [ADR 0022](adr/0022-deshacer-por-instantanea-de-clave.md). La actividad de
los canales observada en una clave aparte, para detectar canales inactivos:
[ADR 0023](adr/0023-actividad-de-canales-observada.md). Las palabras clave de autoasignación como campo opcional del
grupo: [ADR 0024](adr/0024-palabras-clave-en-el-grupo.md). Ajustes, copia de seguridad y limpieza en la página de
opciones (modifica 0017 y 0014):
[ADR 0025](adr/0025-ajustes-copia-y-limpieza-en-opciones.md). Los atajos de teclado con `commands` del manifiesto:
[ADR 0026](adr/0026-atajos-de-teclado-con-commands.md). Su lista en Ajustes del menú de la guía, leída por mensaje:
[ADR 0033](adr/0033-atajos-en-el-menu-de-la-guia.md). Reproducir un grupo con lo observado y `watch_videos`
(sustituida, función retirada):
[ADR 0027](adr/0027-reproducir-un-grupo-con-lo-observado.md). La sincronización opcional con `storage.sync`, troceada y
desde el fondo (modifica 0006): [ADR 0028](adr/0028-sincronizacion-con-storage-sync.md). Las preferencias de vista de
la página de opciones (tamaño de página y secciones plegadas) en `localStorage`:
[ADR 0029](adr/0029-preferencias-de-vista-en-localstorage.md). La copia de seguridad completa (suscripciones, vídeos
nuevos y actividad, límite de 20 MB; modifica 0006, 0018, 0019 y 0023):
[ADR 0030](adr/0030-copia-de-seguridad-completa.md). Las listas de canales como secciones de primer nivel de la página
de opciones, con un selector de tamaño por lista (modifica 0025 y 0029):
[ADR 0031](adr/0031-listas-de-canales-en-primer-nivel.md). Ajustes de vuelta en el menú de la guía, sin "Más opciones…"
y sin "Reproducir un grupo" (modifica 0025, 0017 y 0031; sustituye 0027):
[ADR 0032](adr/0032-ajustes-en-el-menu-y-sin-reproducir-grupo.md). Las bajas de suscripción propagadas a grupos,
actividad, vídeos nuevos y avatares, con salvaguardas (modifica 0018, 0016, 0019 y 0023):
[ADR 0035](adr/0035-bajas-de-suscripcion-propagadas.md). La selección única, el bullet como control de
despliegue y la marquesina en la guía (sustituye 0011; modifica 0020 y 0019):
[ADR 0036](adr/0036-seleccion-unica-y-bullet-desplegable-en-la-guia.md). La página de opciones con pestañas, sin listas
plegables (modifica 0029 y 0031): [ADR 0037](adr/0037-pagina-de-opciones-con-pestanas.md). Los vídeos nuevos
reconocidos por grupo y observados en cualquier página, e iconos de la guía de 22 px (modifica 0019 y 0036):
[ADR 0038](adr/0038-videos-nuevos-reconocidos-por-grupo.md). La página de opciones en tres pestañas y "Grupos" en una
columna (modifica 0037 y 0031): [ADR 0039](adr/0039-opciones-en-tres-pestanas.md). El color de acento del hover de los
botones (modifica 0003 y 0032): [ADR 0040](adr/0040-color-de-acento.md). El botón de icono común, el bullet de la
guía con zoom y flecha en lugar del acento y los botones de miniatura congelados (modifica 0040 y 0036):
[ADR 0041](adr/0041-boton-de-icono-comun.md). La actualización en segundo plano desde la pestaña de YouTube, solo a
`www.youtube.com` y sin permisos nuevos (modifica 0003, 0016, 0018, 0019, 0023, 0034, 0035 y 0038):
[ADR 0042](adr/0042-actualizacion-en-segundo-plano-desde-youtube.md). Los vídeos nuevos reconocidos al salir del
filtro, con sus subgrupos, y la marca "Nuevo" en la miniatura (modifica 0038 y 0019):
[ADR 0043](adr/0043-videos-nuevos-reconocidos-al-salir-del-filtro.md). El menú de opciones con título, pestañas y
altura limitada a la ventana (modifica 0017, 0032 y 0033): [ADR 0045](adr/0045-menu-de-opciones-con-pestanas.md). El botón de texto común del menú de opciones (amplía 0041):
[ADR 0046](adr/0046-boton-de-texto-comun.md). Un buscador por pestaña en la página de opciones (modifica 0037 y
0039): [ADR 0047](adr/0047-un-buscador-por-pestana-en-opciones.md). Nombre ChannelTree e id `channeltree@turhothgor`:
[ADR 0050](adr/0050-nombre-channeltree.md).
