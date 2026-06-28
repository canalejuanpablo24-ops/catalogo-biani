const Airtable = require('airtable');
const fs = require('fs');
const path = require('path');

const token = process.env.AIRTABLE_TOKEN;
const baseId = process.env.AIRTABLE_BASE_ID;
const tableName = process.env.AIRTABLE_TABLE_NAME || "Productos BIANI";

if (!token || !baseId) {
  console.error("Error: Faltan las variables de entorno de Airtable.");
  process.exit(1);
}

const base = new Airtable({ apiKey: token }).base(baseId);
const productos = [];

console.log("Conectando con Airtable...");

base(tableName).select({
  view: "Grid view"
}).eachPage(function page(records, fetchNextPage) {
  
  records.forEach(function(record) {
    const fields = record.fields;
    
    // Si el registro no tiene nombre ni precio, lo saltamos para evitar errores
    if (!fields["Articulo"]) return;

   productos.push({
        id: record.id,
        nombre: fields["Articulo"],
        codigo: fields["Código"] || "",
        precio: fields["precio"] || 0,
        imagen: fields["Imagen"] && fields["Imagen"].length > 0 ? fields["Imagen"][0].url : "",
        categoria: fields["Categoria"] || "General"
    });
  });

  fetchNextPage();
}, function done(err) {
  if (err) {
    console.error("Error al leer registros de Airtable:", err);
    process.exit(1);
  }

  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }

  fs.writeFileSync(
    path.join(dir, 'productos.json'),
    JSON.stringify(productos, null, 2),
    'utf-8'
  );

  console.log(`¡Éxito! Se procesaron ${productos.length} productos.`);
});
    
