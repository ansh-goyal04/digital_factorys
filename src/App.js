import React, { useState } from 'react';

function App() {
  const [formData, setFormData] = useState({
    district: '',
    tahsil: '',
    village: '',
    propertyNo:'',
    
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const response = await fetch('http://localhost:5000/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const result = await response.json();
    alert(result.message);
  };

  return (
    <div>
      <h1>इंडेक्स 2 दस्तऐवज डाउनलोड करा</h1>
      <form onSubmit={handleSubmit}>
        <label>
          जिल्हा (District):
          <input type="text" name="district" value={formData.district} onChange={handleChange} required />
        </label>
        <label>
          तालुका (tahsil):
          <input type="text" name="tahsil" value={formData.tahsil} onChange={handleChange} required />
        </label>
        <label>
          गाव (Village):
          <input type="text" name="village" value={formData.village} onChange={handleChange} required />
        </label>
        <label>
          वर्ष (propertyNo):
          <input type="number" name="propertyNo" value={formData.propertyNo} onChange={handleChange} required />
        </label>
        <button type="submit">डाउनलोड करा (Download)</button>
      </form>
    </div>
  );
}

export default App;