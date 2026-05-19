const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Google Sheets configuration
const SHEET_ID = '1-X13zaPr0TepTByy0UnQ8ZxeFirKUbR__JCcii3Jcrw';
const GOOGLE_SERVICE_ACCOUNT_EMAIL = 'YOUR_SERVICE_ACCOUNT_EMAIL';
const GOOGLE_PRIVATE_KEY = 'YOUR_PRIVATE_KEY';

const auth = new google.auth.JWT(
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    GOOGLE_PRIVATE_KEY,
    ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

app.get('/api/tasks', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Sheet1!A1:Z'
        });
        
        const rows = response.data.values;
        const tasks = parseTasks(rows);
        
        res.json({ success: true, tasks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/markDone', async (req, res) => {
    const { sheetName, rowNum, statusCol, actualCol, userEmail } = req.body;
    
    try {
        const now = new Date();
        const statusRange = `${sheetName}!${columnToLetter(statusCol)}${rowNum}`;
        const actualRange = `${sheetName}!${columnToLetter(actualCol)}${rowNum}`;
        
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                data: [
                    { range: statusRange, values: [['Done']] },
                    { range: actualRange, values: [[formatDateForSheet(now)]] }
                ],
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        res.json({ success: true, message: `Done by ${userEmail}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function columnToLetter(colNum) {
    let letter = '';
    while (colNum > 0) {
        const rem = (colNum - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        colNum = Math.floor((colNum - 1) / 26);
    }
    return letter;
}

function formatDateForSheet(date) {
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
}

function parseTasks(rows) {
    // Parse tasks from sheet rows
    const tasks = [];
    // Implementation depends on your sheet structure
    return tasks;
}

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});