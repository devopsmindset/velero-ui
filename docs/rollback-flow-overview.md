# Rollback de Backups — Cómo funciona

## Qué es el Rollback

El rollback es una funcionalidad que permite restaurar los datos de una aplicación a un estado anterior, utilizando una copia de seguridad (backup) previamente realizada. Todo el proceso se ejecuta desde la interfaz web de Velero UI, sin necesidad de usar la línea de comandos.

---

## Cómo se inicia

1. El usuario accede a la interfaz web y selecciona el backup desde el que quiere restaurar.
2. La aplicación muestra una vista previa con los recursos que se verán afectados: aplicaciones en ejecución y volúmenes de datos.
3. El usuario confirma que desea proceder con el rollback.
4. Antes de iniciar, se verifican los permisos del usuario para asegurar que tiene autorización para realizar esta operación.

---

## Qué ocurre durante el rollback

El proceso se ejecuta en 6 pasos secuenciales. El usuario puede seguir el progreso en tiempo real desde la interfaz, que muestra cada paso con un indicador de estado (pendiente, en curso, completado o fallido).

### Paso 1 — Detener las aplicaciones

Se detienen todas las aplicaciones que están corriendo en el entorno afectado. Antes de detenerlas, se guarda cuántas instancias tenía cada una, para poder restaurarlas después.

Por ejemplo, si una aplicación tenía 3 instancias corriendo, se anota ese número y se reduce a 0.

### Paso 2 — Esperar a que todo se detenga

Se espera a que todas las instancias de las aplicaciones se apaguen completamente. Este paso tiene un tiempo máximo de espera de **2 minutos**. Si pasado ese tiempo alguna instancia sigue activa, el proceso se considera fallido.

### Paso 3 — Eliminar los datos actuales

Se eliminan los volúmenes de datos (discos) actuales del entorno. Esto es necesario porque van a ser reemplazados por los datos del backup.

Si el backup original se hizo con un filtro (por ejemplo, solo ciertos componentes marcados con una etiqueta), únicamente se eliminan los volúmenes que coincidan con ese filtro.

### Paso 4 — Solicitar la restauración

Se crea una solicitud de restauración en Velero, indicando:
- Desde qué backup restaurar.
- En qué entorno restaurar.
- Que se incluyan los volúmenes de datos.

Velero se encarga de recrear los volúmenes de datos a partir de la copia de seguridad.

### Paso 5 — Esperar a que la restauración termine

Se monitorea el estado de la restauración hasta que Velero confirme que ha terminado. Este paso tiene un tiempo máximo de espera de **5 minutos**. El proceso falla si:
- La restauración reporta un error.
- Se agota el tiempo de espera.

### Paso 6 — Reiniciar las aplicaciones

Se vuelven a arrancar todas las aplicaciones con el mismo número de instancias que tenían antes del rollback (el que se anotó en el paso 1). Las aplicaciones ahora acceden a los datos restaurados desde el backup.

---

## Qué pasa si algo sale mal

Si cualquier paso falla, el sistema intenta una **recuperación automática**:

- Si las aplicaciones ya habían sido detenidas, se intentan reiniciar con su configuración original.
- El usuario recibe un mensaje indicando qué paso falló y cuál fue el error.
- Se incluye la información de las instancias originales por si fuera necesario intervenir manualmente.

Si la recuperación automática también falla, se muestra un mensaje indicando que es necesaria **intervención manual** y se proporcionan los datos necesarios para hacerlo.

---

## Qué ve el usuario durante el proceso

La interfaz muestra una línea de tiempo vertical con los 6 pasos. Cada paso tiene:

- Un **icono de color** que indica su estado:
  - Gris = pendiente
  - Azul = en curso
  - Verde = completado
  - Rojo = fallido
- Un **mensaje descriptivo** de lo que está ocurriendo.
- **Detalles adicionales** cuando es relevante (por ejemplo, el nombre de cada aplicación que se detiene).

Al finalizar, se muestra un banner indicando si el rollback fue exitoso o si hubo errores.

---

## Tiempos de espera

| Paso | Tiempo máximo |
|------|---------------|
| Esperar a que las aplicaciones se detengan | 2 minutos |
| Esperar a que la restauración termine | 5 minutos |

Si se supera alguno de estos tiempos, el proceso se detiene y se intenta la recuperación automática.

---

## Limitaciones conocidas

1. **No se puede cancelar:** Una vez iniciado el rollback, no hay forma de detenerlo desde la interfaz.

2. **Los datos eliminados no se recuperan automáticamente:** Si los volúmenes de datos se eliminan (paso 3) pero la restauración falla (pasos 4-5), la recuperación automática solo reinicia las aplicaciones — los datos no se recrean. Se propone crear una copia de seguridad de los datos antes de eliminarlos para mitigar este riesgo.

3. **Tiempos fijos:** Los tiempos de espera no son configurables. Para entornos con mucho volumen de datos, podrían ser insuficientes.

4. **Sin notificación por desconexión:** Si la conexión con el servidor se pierde durante el proceso, el rollback continúa ejecutándose pero el usuario deja de ver el progreso.

---

## Compatibilidad con despliegues Helm

El rollback es compatible con aplicaciones desplegadas mediante Helm. Los recursos restaurados conservan la información que Helm necesita para seguir gestionándolos. Tras un rollback, las operaciones habituales de Helm (actualizar, desinstalar) continúan funcionando con normalidad.

---

## Resumen del flujo

```
Usuario selecciona backup
         │
         ▼
  ┌─────────────────┐
  │ 1. Detener apps │
  └────────┬────────┘
           ▼
  ┌─────────────────────────┐
  │ 2. Esperar a que paren  │  ← máx. 2 min
  └────────┬────────────────┘
           ▼
  ┌──────────────────────────┐
  │ 3. Eliminar datos        │
  │    actuales              │
  └────────┬─────────────────┘
           ▼
  ┌──────────────────────────┐
  │ 4. Solicitar             │
  │    restauración          │
  └────────┬─────────────────┘
           ▼
  ┌──────────────────────────┐
  │ 5. Esperar restauración  │  ← máx. 5 min
  └────────┬─────────────────┘
           ▼
  ┌──────────────────────────┐
  │ 6. Reiniciar apps        │
  └────────┬─────────────────┘
           ▼
     Rollback completado
```

En caso de fallo en cualquier paso, se intenta reiniciar las aplicaciones automáticamente.
