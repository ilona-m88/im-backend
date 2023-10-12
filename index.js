import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Cayenne88*",
    database: "sakila"
});

app.get("/getData", (req, res) => {
    const query = `
        SELECT film.title, film.description, COUNT(rental.rental_id) AS rental_count
        FROM film 
        INNER JOIN inventory ON film.film_id = inventory.film_id
        INNER JOIN rental ON inventory.inventory_id = rental.inventory_id
        GROUP BY film.title, film.description
        ORDER BY rental_count DESC
        LIMIT 5;
    `;
    db.query(query, (err, results) => {
        if (err) throw err;
        console.log("Backend Results:", results);
        res.json(results);
    });
});

// User Story: View details of a specific movie by film_id
app.get("/getMovieDetails/:movieId", async (req, res) => {
    const movieId = req.params.movieId;
    try {
        const movieQuery = `SELECT * FROM film WHERE film_id = ?`;
        const movieResult = await db.promise().query(movieQuery, [movieId]);

        // Category of the movie
        const categoryQuery = `
            SELECT category.name 
            FROM category 
            INNER JOIN film_category ON category.category_id = film_category.category_id 
            WHERE film_category.film_id = ?`;
        const categoryResult = await db.promise().query(categoryQuery, [movieId]);

        // Actors in the movie
        const actorsQuery = `
            SELECT actor.first_name, actor.last_name 
            FROM actor 
            INNER JOIN film_actor ON actor.actor_id = film_actor.actor_id 
            WHERE film_actor.film_id = ?`;
        const actorsResult = await db.promise().query(actorsQuery, [movieId]);

        // Combining the details
        const detailedMovieInfo = {
            ...movieResult[0][0],
            category: categoryResult[0].map(cat => cat.name),
            actors: actorsResult[0].map(actor => `${actor.first_name} ${actor.last_name}`)
        };

        res.json(detailedMovieInfo);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// User Story: View the top 5 actors who are part of movies in the store
app.get("/getTopActors", async (req, res) => {
    try {
        const query = `
            SELECT a.actor_id, a.first_name, a.last_name, COUNT(fa.film_id) AS film_count
            FROM actor AS a
            INNER JOIN film_actor AS fa ON a.actor_id = fa.actor_id
            GROUP BY a.actor_id, a.first_name, a.last_name
            ORDER BY film_count DESC
            LIMIT 5;
        `;
        const results = await db.promise().query(query);
        res.json(results[0]);
    } catch (err) {
        console.error("Error in getTopActors:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Define the route for getting actor details by actor_id
app.get("/getActorDetails/:actorId", async (req, res) => {
    const actorId = req.params.actorId;
    try {
        // Fetch actor details from the database using the actorId parameter
        const actorQuery = `SELECT * FROM actor WHERE actor_id = ?`;
        const actorResult = await db.promise().query(actorQuery, [actorId]);

        // Check if actor details were found
        if (actorResult[0].length > 0) {
            // Return the actor details as JSON response
            res.json(actorResult[0][0]);
        } else {
            // If actor not found, return a 404 status and message
            res.status(404).json({ error: "Actor not found" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
app.get("/getActorTopMovies/:actorId", async (req, res) => {
    const actorId = req.params.actorId;
  
    // Query the database to get the actor's top 5 rented movies
    try {
      const query = `
      SELECT f.film_id, f.title, COUNT(r.rental_id) AS rental_count
      FROM film AS f
      JOIN film_actor AS fa ON f.film_id = fa.film_id
      JOIN inventory AS i ON f.film_id = i.film_id
      JOIN rental AS r ON i.inventory_id = r.inventory_id
      WHERE fa.actor_id = ?
      GROUP BY f.film_id, f.title
      ORDER BY rental_count DESC
      LIMIT 5;
      
      `;
      const results = await db.promise().query(query, [actorId]);
  
      // Return the results to the client
      res.json(results[0]);
    } catch (err) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

// User Story: View top 5 rented movies of all time
app.get("/getTopRentedMovies", async (req, res) => {
    try {
        const query = `
            SELECT f.film_id, f.title, COUNT(r.rental_id) AS rental_count
            FROM film AS f
            JOIN inventory AS i ON f.film_id = i.film_id
            JOIN rental AS r ON i.inventory_id = r.inventory_id
            GROUP BY f.film_id, f.title
            ORDER BY rental_count DESC
            LIMIT 5;
        `;
        const results = await db.promise().query(query);
        res.json(results[0]);
    } catch (err) {
        console.error("Error in getTopRentedMovies:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/searchMovies", async (req, res) => {
    const searchTerm = req.query.q;
    const query = `
        SELECT film.title, film.description, film.film_id, COUNT(rental.rental_id) AS rental_count
        FROM film 
        LEFT JOIN film_actor ON film.film_id = film_actor.film_id
        LEFT JOIN actor ON film_actor.actor_id = actor.actor_id
        LEFT JOIN film_category ON film.film_id = film_category.film_id
        LEFT JOIN category ON film_category.category_id = category.category_id
        LEFT JOIN inventory ON film.film_id = inventory.film_id
        LEFT JOIN rental ON inventory.inventory_id = rental.inventory_id
        WHERE film.title LIKE ? OR actor.first_name LIKE ? OR actor.last_name LIKE ? OR category.name LIKE ?
        GROUP BY film.title, film.description, film.film_id
    `;

    try {
        const results = await db.promise().query(query, [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]);
        res.json(results[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.post("/rentMovie", async (req, res) => {
    const { movieId, customerId } = req.body;

    // Check if movie is available in inventory
    const availableInventoryQuery = `SELECT inventory_id 
                                     FROM inventory 
                                     WHERE film_id = ? 
                                     AND inventory_id NOT IN (SELECT inventory_id FROM rental WHERE return_date IS NULL) 
                                     LIMIT 1;
                                     `;
    const [availableInventories] = await db.promise().query(availableInventoryQuery, [movieId]);

    if (availableInventories.length === 0) {
        return res.status(400).json({ error: "Movie is not available for rent" });
    }

    const inventoryId = availableInventories[0].inventory_id;

    const rentalQuery = `INSERT INTO rental (rental_date, inventory_id, customer_id) 
                        VALUES (NOW(), ?, ?)
                        `;
    try {
        await db.promise().query(rentalQuery, [inventoryId, customerId]);
        res.json({ success: true, message: 'Movie rented successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get("/getCustomers", async (req, res) => {
    const searchTerm = req.query.q;
    const query = `
        SELECT customer_id, first_name, last_name
        FROM customer
        WHERE customer_id LIKE ? OR first_name LIKE ? OR last_name LIKE ?
    `;
 
    try {
        const results = await db.promise().query(query, [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]);
        res.json(results[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
app.get("/getCustomerRentals/:customerId", async (req, res) => {
    const customerId = req.params.customerId;
  
    try {
      // Fetch movies rented by the customer using the customer ID
      const rentalsQuery = `
      SELECT film.title, rental.rental_date, rental.return_date, customer.customer_id, customer.email
      FROM rental
      INNER JOIN inventory ON rental.inventory_id = inventory.inventory_id
      INNER JOIN film ON inventory.film_id = film.film_id
      INNER JOIN customer ON rental.customer_id = customer.customer_id
      WHERE rental.customer_id = ?
    `;
      const rentalsResult = await db.promise().query(rentalsQuery, [customerId]);
  
      // Return the list of rented movies as a JSON response
      res.json(rentalsResult[0]);
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  app.post("/addCustomer", async (req, res) => {
    const { firstName, lastName, email } = req.body;

    try {
        const addCustomerQuery = `
            INSERT INTO customer (store_id, first_name, last_name, email, address_id, active, create_date, last_update)
            VALUES (1, ?, ?, ?, 1, 1, NOW(), NOW());
        `;

        await db.promise().query(addCustomerQuery, [firstName, lastName, email]);
        const insertResults = await db.promise().query(addCustomerQuery, [firstName, lastName, email]);
        const newCustomerId = insertResults[0].insertId;

            const fetchNewCustomerQuery = 'SELECT * FROM customer WHERE customer_id = ?';
        const [newCustomerData] = await db.promise().query(fetchNewCustomerQuery, [newCustomerId]);

        res.json({ success: true, message: 'Customer added successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
app.put("/updateCustomer/:customerId", async (req, res) => {
    const customerId = req.params.customerId;
    const { firstName, lastName, email } = req.body;

    if (!firstName || !lastName) {
        return res.status(400).send('First name and last name cannot be null.');
    }
    try {
        const updateCustomerQuery = `
            UPDATE customer
            SET first_name = ?, last_name = ?, email = ?
            WHERE customer_id = ?;
        `;

        await db.promise().query(updateCustomerQuery, [firstName, lastName, email, customerId]);
        res.json({ success: true, message: 'Customer details updated successfully!' });
    } catch (err) {
        console.error("Error updating customer:", err);
        res.status(500).send("Server Error");
    }
});
app.delete("/deleteCustomer/:customerId", async (req, res) => {
    const customerId = req.params.customerId;

    try {
        const deleteQuery = `DELETE FROM customer WHERE customer_id = ?`;
        await db.promise().query(deleteQuery, [customerId]);
        
        res.json({ success: true, message: 'Customer deleted successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
app.put("/returnMovie", async (req, res) => {
    const { rentalId } = req.body;

    try {
        const returnMovieQuery = `
            UPDATE rental
            SET return_date = NOW()
            WHERE rental_id = ?;
        `;

        await db.promise().query(returnMovieQuery, [rentalId]);
        res.json({ success: true, message: 'Movie returned successfully!' });
    } catch (err) {
        console.error("Error returning movie:", err);
        res.status(500).send("Server Error");
    }
});


app.get("/getCustomersWhoRentedMovies", async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT customer.customer_id, customer.first_name, customer.last_name
            FROM customer
            JOIN rental ON customer.customer_id = rental.customer_id
        `;

        const results = await db.promise().query(query);
        res.json(results[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

  



app.listen(3001, () => console.log("app is running"));
