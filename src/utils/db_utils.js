import pool from '../config/db.js';

/**
 * Inserts data into the specified table.
 * @param {string} tableName - Name of the table
 * @param {Object} data - Key-value pairs of column names and values
 * @returns {Promise<number|null>} - Returns inserted row ID or null on failure
 */
export async function updatedinsertTable(tableName, data, ens_id, session_id) {
  if (
    !tableName ||
    typeof data !== 'object' ||
    Object.keys(data).length === 0
  ) {
    throw new Error('Invalid table name or data');
  }

  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const query = `INSERT INTO ${tableName} (${columns.join(', ')}) 
        VALUES (${placeholders}) 
        ON CONFLICT (ens_id, session_id) 
        DO UPDATE SET ${columns
          .map((col) => `${col} = EXCLUDED.${col}`)
          .join(', ')}
        RETURNING *`;

  try {
    const result = await pool.query(query, values);
    if (result.rows) {
      console.log('Successfully inserted data');
    } else {
      console.log('Failed to insert data.');
    }
    return result.rows || [];
  } catch (error) {
    console.error('Error inserting data:', error);
    return null;
  }
}

export async function updateTable(tableName, data, ens_id, session_id) {
  if (
    !tableName ||
    typeof data !== 'object' ||
    Object.keys(data).length === 0
  ) {
    throw new Error('Invalid table name or data');
  }

  const columns = Object.keys(data); // Get column names from the data object
  const values = Object.values(data); // Get values from the data object

  // Generate the SET clause for updating each column
  const setClause = columns
    .map((col, index) => `${col} = $${index + 1}`)
    .join(', ');

  // Generate the query for updating based on ens_id and session_id
  const query = `
      UPDATE ${tableName}
      SET ${setClause}
      WHERE ens_id = $${columns.length + 1} AND session_id = $${
    columns.length + 2
  }
      RETURNING *;
    `;

  try {
    // Run the update query using your database connection pool
    const result = await pool.query(query, [...values, ens_id, session_id]);
    // Check if any row was updated
    if (result.rowCount === 0) {
      return {
        success: false,
        message: `No record found with ens_id = ${ens_id} and session_id = ${session_id}.`,
        data: [],
      };
    }
    return {
      success: true,
      message: `Success`,
      data: result.rows,
    }; // Return the updated rows
  } catch (error) {
    console.error('Error updating data:', error);
    throw error;
  }
}
