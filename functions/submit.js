import {nanoid} from 'nanoid';

export async function handle({ request, env }) {
    let resp = {
        'success': false
    }

    // This endpoint supports POST only
    if (request.method !== 'POST') {
        resp.message = `${request.method} is not allowed on this endpoint`
        return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
    }

    // Now they're out the way, we check for formdata
    let formData;
    try {
        formData = await request.formData();
        if (!formData) {
            resp.message = `No formData was provided`
            return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
        }
    }
    catch(e) {
        resp.message = e.message
        return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
    }

    if (formData.keys().length == 0) {
        resp.message = `No formData was provided`
        return new Response(JSON.stringify(resp), {status: 400, headers: {'Content-Type': 'application/json'}})
    }

    // Check for location data
    let latitude = formData.get('latitude') || null
    let longitude = formData.get('longitude') || null

    if (latitude == 'Location not retrieved') latitude = null
    if (longitude == 'Location not retrieved') longitude = null

    // And get ready to upload our files
    let photos = formData.get('photos', null);
    if (photos) {
        for (let p in photos) {
            // We are ready to upload them, but what we need to do it store them securely at an un-guessable path
            let uuid = nanoid();

            // Now, we prepare an upload
            let r2 = await env.R2.put(uuid, p.arrayBuffer);
        }
    }
    // Ready to insert into D1

    // And we did it, so return a success response
    resp.success = true;
    return new Response(JSON.stringify(resp), {headers: {'Content-Type': 'application/json'}});
}

export async function onRequest({ request, env }) {
	return await handle({ request, env });
}