const {webUrl,movieId}=require('./core.cjs');
function trailerDestination(movie) {
 const id=movieId(movie.id);
 if(movie.trailer){try{return{url:webUrl(movie.trailer),direct:true}}catch{}}
 // Kinopoisk's video archive uses the legacy /film/ route for series too.
 return {url:`https://www.kinopoisk.ru/film/${id}/video/`,direct:false};
}
module.exports={trailerDestination};
