const Auth = {
    token: null,

    async login(username, password) {
        const res = await fetch(`${CONFIG.API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) return false;
        const data = await res.json();
        this.token = data.access_token;
        return true;
    },

    logout() {
        this.token = null;
    },

    headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }
};