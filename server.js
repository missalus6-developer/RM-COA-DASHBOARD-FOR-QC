// Optional: Simple local server for development
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.static('.'));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
