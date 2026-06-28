
const Airtable = require('airtable');
const fs = require('fs');
const path = require('path');

// Configuración de llaves de Airtable
const token = process.env.AIRTABLE_TOKEN;
const baseId = process.env.AIRTABLE_BASE_ID;
const tableName = process.env.AIRTABLE_TABLE_NAME || "Productos BIANI";

if (!token || !baseId) {
  console.error("Error: Faltan las variables de entorno de Airtable.");
  process.exit(1);
}

const base = new Airtable({ apiKey: token }).base(baseId);
const productos = [];

console.log("Conectando con Airtable para traer los productos...");

base(tableName).select({
  view: "Grid view"
}).eachPage(function page(records, fetchNextPage) {
  
  records.forEach(function(record) {
    const fields = record.fields;
    
    productos.push({
      id: record.id,
      nombre: fields["Nombre"] || fields["Producto"] || "Producto sin nombre",
      descripcion: fields["Descripción"] || fields["Descripcion"] || "",
      // Buscamos directamente tu columna "Precio"
      precio: fields["Precio"] || 0, 
      imagen: fields["Imagen"] && fields["Imagen"].length > 0 ? fields["Imagen"][0].url : "https://via.placeholder.com/150",
      categoria: fields["Categoría"] || fields["Categoria"] || "General",
      disponible: fields["Disponible"] !== undefined ? fields["Disponible"] : true
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

  console.log(`¡Éxito! Se procesaron ${productos.length} productos correctamente.`);
});
