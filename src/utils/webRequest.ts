export const sendJsonPutRequestWithAccessToken = (url: RequestInfo, data: any, accessToken: string) => {
    const config = {
        method: 'PUT',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        },
        body: JSON.stringify(data)
    };
    return fetch(url, config);
};
export const sendJsonPostRequestWithAccessToken = (url: RequestInfo, data: any, accessToken: string) => {
    const config = {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: "Bearer " + accessToken
        },
        body: JSON.stringify(data)
    };
    return fetch(url, config);
};

export const postForm = (url: RequestInfo, data: any) => {
    return fetch(url, {
        method: 'POST',
        body: new URLSearchParams(data)
    });
};
export const postForm2 = (url: RequestInfo, data: any) => {
    return fetch(url, {
        method: 'POST',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(data)
    });
};
export const asyncGet2 = (url: RequestInfo, accessToken: string) => {
    const config = {
        method: 'GET',
        headers: {
            'Accept': '*',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        }
    };
    return fetch(url, config);
};

export const asyncGet = (url: RequestInfo, accessToken: string) => {
    const config = {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        }
    };
    return fetch(url, config);
};

export const asyncGetWithoutToken = (url: RequestInfo) => {
    const config = {
        method: 'GET'
    };
    return fetch(url, config);
}

export const asyncDelete = (url: RequestInfo, accessToken: string) => {
    const config = {
        method: 'DELETE',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        }
    };
    return fetch(url, config);
};
