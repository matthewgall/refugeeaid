export async function handle({ request, env }) {
    let image = new URL(request.url).pathname.replace('/uploads/', '').trim();

    let data;
    let headers;
    
    try {
        let r2 = await env.R2.get(image);
        data = await r2.blob();

        headers = new Headers();
        r2.writeHttpMetadata(headers);
    }
    catch(e) {
        data = null
    }
    
    if (data == null) {
        return new Response('Image not found. Please check and try again', {
            status: 404,
            headers: {
                'Content-Type': 'text/plain'
            }
        })
    }

    return new Response(data, {
        headers: headers
    });
}

export async function onRequest({ request, env }) {
	return await handle({ request, env });
}