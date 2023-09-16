import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());

app.get("/getData",(req,res)=>{
    res.status(200).send("Hello World");
});

app.listen(3001, () => console.log("app is running"));