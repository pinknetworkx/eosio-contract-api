$(document).ready(function() {
    var elements = $('.sticky');
    Stickyfill.add(elements);

    $('body').scrollspy({target: '#doc-menu', offset: 100});

	$('a.scrollto').on('click', function(e){
        //store hash
        var target = this.hash;    
        e.preventDefault();
		$('body').scrollTo(target, 800, {offset: 0, 'axis':'y'});
		
	});

    $(document).delegate('*[data-toggle="lightbox"]', 'click', function(e) {
        e.preventDefault();
        $(this).ekkoLightbox();
    });

    $('.api-base-path').text(window.location.origin + '/' + window.location.pathname.split('/')[1]);
});
